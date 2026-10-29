import { DevRevApiError } from "./devrev.client";
import {
  CustomObjectUpsert,
  DevRevRecordService,
} from "./devrev-record.service";
import { DevRevSyncConfig } from "./devrev-sync.config";
import {
  DevRevLeafType,
  DevRevSync,
  DevRevSyncStatus,
} from "./entities/devrev-sync.entity";

const USER_ID = "6f1c2a3b-0000-4000-8000-000000000001";

function config(env: Record<string, string> = {}): DevRevSyncConfig {
  const values: Record<string, string> = {
    DEVREV_SYNC_ENABLED: "true",
    DEVREV_TOKEN: "t",
    ...env,
  };
  return new DevRevSyncConfig({ get: (key: string) => values[key] } as any);
}

function apiError(status: number, message: string, retryable = false) {
  return new DevRevApiError(message, "x", status, retryable, null, null, {
    message,
  });
}

/** In-memory stand-in for the DevRevSync repository. */
function memoryRepository() {
  const rows = new Map<string, DevRevSync>();
  const key = (r: Partial<DevRevSync>) => `${r.leafType}|${r.externalId}`;
  return {
    rows,
    findOne: jest.fn(async ({ where }) => {
      const row = rows.get(key(where));
      return row ? { ...row } : null;
    }),
    create: jest.fn((data) => ({ ...data } as DevRevSync)),
    save: jest.fn(async (row: DevRevSync) => {
      rows.set(key(row), { ...row });
      return row;
    }),
    update: jest.fn(async () => ({ affected: 1 })),
    find: jest.fn(async (_options: any) => [] as Partial<DevRevSync>[]),
  };
}

const enrollment = (
  fields: Record<string, any> = { cohort: "ALP-2026-C2" }
): CustomObjectUpsert => ({
  leafType: DevRevLeafType.ALP_ENROLLMENT,
  uniqueKey: `ALPE:${USER_ID}:ALP-2026-C2`,
  externalId: `${USER_ID}:ALP-2026-C2`,
  lookupField: "external_id",
  lookupValue: `${USER_ID}:ALP-2026-C2`,
  title: "Amina · ALP-2026-C2",
  fields,
  userId: USER_ID,
  cohortId: "c0000000-0000-4000-8000-000000000002",
});

describe("DevRevRecordService", () => {
  let client: { post: jest.Mock };
  let repository: ReturnType<typeof memoryRepository>;
  let service: DevRevRecordService;

  const calls = () => client.post.mock.calls.map(([endpoint]) => endpoint);

  beforeEach(() => {
    client = { post: jest.fn() };
    repository = memoryRepository();
    service = new DevRevRecordService(
      client as any,
      config(),
      repository as any
    );
  });

  describe("upsertCustomObject", () => {
    it("creates a new record with unique_key, tnt__ fields and the tenant fragment", async () => {
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });

      const row = await service.upsertCustomObject(enrollment());

      expect(client.post).toHaveBeenCalledWith("custom-objects.create", {
        leaf_type: "alp_enrollment",
        unique_key: `ALPE:${USER_ID}:ALP-2026-C2`,
        title: "Amina · ALP-2026-C2",
        custom_schema_spec: { tenant_fragment: true },
        custom_fields: { tnt__cohort: "ALP-2026-C2" },
      });
      expect(row).toMatchObject({
        devrevId: "don:enr/1",
        status: DevRevSyncStatus.SYNCED,
        lastError: null,
      });
      expect(row.payloadHash).toHaveLength(64);
    });

    it("on a unique_key conflict, finds the record by external_id and updates it", async () => {
      client.post
        .mockRejectedValueOnce(apiError(409, "unique key already exists"))
        .mockResolvedValueOnce({ custom_objects: [{ id: "don:enr/7" }] })
        .mockResolvedValueOnce({ custom_object: { id: "don:enr/7" } });

      const row = await service.upsertCustomObject(enrollment());

      expect(calls()).toEqual([
        "custom-objects.create",
        "custom-objects.list",
        "custom-objects.update",
      ]);
      expect(client.post.mock.calls[1][1]).toEqual({
        leaf_type: "alp_enrollment",
        filter: [
          "eq",
          "$custom_fields.tnt__external_id",
          `${USER_ID}:ALP-2026-C2`,
        ],
      });
      expect(client.post.mock.calls[2][1]).toMatchObject({ id: "don:enr/7" });
      expect(row.devrevId).toBe("don:enr/7");
    });

    it("updates by the stored DevRev ID once known", async () => {
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });
      await service.upsertCustomObject(enrollment());
      client.post.mockClear().mockResolvedValueOnce({});

      await service.upsertCustomObject(
        enrollment({ cohort: "ALP-2026-C2", is_latest_attempt: false })
      );

      expect(calls()).toEqual(["custom-objects.update"]);
      expect(client.post.mock.calls[0][1]).toMatchObject({ id: "don:enr/1" });
    });

    it("skips the API when the payload has not changed", async () => {
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });
      await service.upsertCustomObject(enrollment());
      client.post.mockClear();

      await service.upsertCustomObject(enrollment());

      expect(client.post).not.toHaveBeenCalled();
    });

    it("re-creates a record that was deleted in DevRev", async () => {
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });
      await service.upsertCustomObject(enrollment());
      client.post
        .mockClear()
        .mockRejectedValueOnce(apiError(404, "not found"))
        .mockResolvedValueOnce({ custom_object: { id: "don:enr/2" } });

      const row = await service.upsertCustomObject(
        enrollment({ cohort: "ALP-2026-C2", week: 2 })
      );

      expect(calls()).toEqual([
        "custom-objects.update",
        "custom-objects.create",
      ]);
      expect(row.devrevId).toBe("don:enr/2");
    });

    it("links a re-created record again", async () => {
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });
      const first = await service.upsertCustomObject(enrollment());
      client.post.mockResolvedValueOnce({});
      await service.ensureLink(first, "don:revu/1", "don:lt/3");
      client.post
        .mockClear()
        .mockRejectedValueOnce(apiError(404, "not found"))
        .mockResolvedValueOnce({ custom_object: { id: "don:enr/2" } })
        .mockResolvedValueOnce({});

      const row = await service.upsertCustomObject(
        enrollment({ cohort: "ALP-2026-C2", week: 2 })
      );
      await service.ensureLink(row, "don:revu/1", "don:lt/3");

      expect(client.post).toHaveBeenLastCalledWith("links.create", {
        link_type: "custom_link",
        custom_link_type: "don:lt/3",
        source: "don:revu/1",
        target: "don:enr/2",
      });
      expect(row.linked).toBe(true);
    });

    it("records the failure on the row and rethrows", async () => {
      client.post.mockRejectedValueOnce(
        apiError(400, "field 'tnt__x' not in referenced custom schema")
      );

      await expect(
        service.upsertCustomObject(enrollment())
      ).rejects.toBeInstanceOf(DevRevApiError);

      const saved = repository.rows.get(
        `alp_enrollment|${USER_ID}:ALP-2026-C2`
      );
      expect(saved).toMatchObject({
        status: DevRevSyncStatus.REJECTED,
        attempts: 1,
      });
      expect(saved.devrevId).toBeUndefined();
      expect(saved.lastError).toContain("not in referenced custom schema");
    });

    it("marks a 5xx or database failure as FAILED, so it is retried", async () => {
      const status = () =>
        repository.rows.get(`alp_enrollment|${USER_ID}:ALP-2026-C2`).status;

      client.post.mockRejectedValueOnce(apiError(503, "unavailable", true));
      await service.upsertCustomObject(enrollment()).catch(() => undefined);
      expect(status()).toBe(DevRevSyncStatus.FAILED);

      client.post.mockRejectedValueOnce(new Error("connection reset"));
      await service.upsertCustomObject(enrollment()).catch(() => undefined);
      expect(status()).toBe(DevRevSyncStatus.FAILED);
    });

    it("clears the failure state once a write succeeds", async () => {
      client.post.mockRejectedValueOnce(apiError(400, "bad"));
      await service.upsertCustomObject(enrollment()).catch(() => undefined);
      client.post.mockResolvedValueOnce({ custom_object: { id: "don:enr/1" } });

      const row = await service.upsertCustomObject(enrollment());

      expect(row).toMatchObject({
        status: DevRevSyncStatus.SYNCED,
        attempts: 0,
        lastError: null,
      });
    });

    it("in dry-run, stores no DevRev ID so a real run creates the record later", async () => {
      service = new DevRevRecordService(
        client as any,
        config({ DEVREV_SYNC_DRY_RUN: "true" }),
        repository as any
      );
      client.post.mockResolvedValueOnce({
        id: "don:dry-run:custom-objects.create:1",
      });

      const row = await service.upsertCustomObject(enrollment());

      expect(row.status).toBe(DevRevSyncStatus.DRY_RUN);
      expect(row.devrevId).toBeUndefined();
    });
  });

  describe("upsertRevUser", () => {
    const body = {
      display_name: "Amina Okafor",
      external_ref: USER_ID,
      rev_org: "org",
      email: "a@x.org",
    };

    it("creates the Rev User when none has this external_ref", async () => {
      client.post
        .mockResolvedValueOnce({ rev_users: [] })
        .mockResolvedValueOnce({ rev_user: { id: "don:revu/1" } });

      const row = await service.upsertRevUser(USER_ID, body);

      expect(calls()).toEqual(["rev-users.list", "rev-users.create"]);
      expect(client.post.mock.calls[0][1]).toEqual({ external_ref: [USER_ID] });
      expect(row.devrevId).toBe("don:revu/1");
    });

    it("reuses and updates an existing Rev User found by external_ref", async () => {
      client.post
        .mockResolvedValueOnce({ rev_users: [{ id: "don:revu/5" }] })
        .mockResolvedValueOnce({});

      const row = await service.upsertRevUser(USER_ID, body);

      expect(calls()).toEqual(["rev-users.list", "rev-users.update"]);
      expect(client.post.mock.calls[1][1]).toEqual({
        id: "don:revu/5",
        display_name: "Amina Okafor",
        email: "a@x.org",
      });
      expect(row.devrevId).toBe("don:revu/5");
    });
  });

  describe("ensureLink", () => {
    const record = (): DevRevSync =>
      ({
        leafType: DevRevLeafType.ALP_ENROLLMENT,
        externalId: "e",
        devrevId: "don:enr/1",
        linked: false,
      } as DevRevSync);

    it("links Rev User (source) to the record (target) once", async () => {
      client.post.mockResolvedValueOnce({});
      const row = record();

      await service.ensureLink(row, "don:revu/1", "don:link-type/1");
      await service.ensureLink(row, "don:revu/1", "don:link-type/1");

      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledWith("links.create", {
        link_type: "custom_link",
        custom_link_type: "don:link-type/1",
        source: "don:revu/1",
        target: "don:enr/1",
      });
      expect(row.linked).toBe(true);
    });

    it("treats an existing link as done", async () => {
      client.post.mockRejectedValueOnce(apiError(409, "link already exists"));
      const row = record();

      await service.ensureLink(row, "don:revu/1", "don:link-type/1");

      expect(row.linked).toBe(true);
    });

    it("records the error on the row when the link is refused", async () => {
      const error = apiError(400, "invalid link type");
      client.post.mockRejectedValueOnce(error);
      const row = record();

      await expect(
        service.ensureLink(row, "don:revu/1", "don:link-type/1")
      ).rejects.toBe(error);

      expect(row.linked).toBe(false);
      expect(row.lastError).toBe("links.create: invalid link type");
      expect(repository.save).toHaveBeenCalledWith(row);
    });

    it("does nothing without a Rev User or link type", async () => {
      await service.ensureLink(record(), null, "don:link-type/1");
      await service.ensureLink(record(), "don:revu/1", "");

      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe("userIdsToRetry", () => {
    it("asks only for FAILED records within the auto-retry limit", async () => {
      repository.find.mockResolvedValueOnce([
        { userId: "u1" },
        { userId: "u1" },
        { userId: "u2" },
      ]);

      const userIds = await service.userIdsToRetry();

      expect(userIds).toEqual(["u1", "u2"]);
      const { where } = repository.find.mock.calls[0][0];
      // REJECTED rows are never picked up
      expect(where.status).toBe(DevRevSyncStatus.FAILED);
      // 5 job attempts + 3 auto-retry rounds of 5
      expect(where.attempts).toMatchObject({ _type: "lessThan", _value: 20 });
    });
  });
});
