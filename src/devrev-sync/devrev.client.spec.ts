import { Logger } from "@nestjs/common";
import axios from "axios";
import {
  DevRevApiError,
  DevRevClient,
  firstArray,
  idOf,
} from "./devrev.client";
import { DevRevSyncConfig } from "./devrev-sync.config";

const TOKEN = "secret-pat-value";

function config(env: Record<string, string> = {}): DevRevSyncConfig {
  const values: Record<string, string> = {
    DEVREV_SYNC_ENABLED: "true",
    DEVREV_TOKEN: TOKEN,
    DEVREV_BASE_URL: "https://api.devrev.ai/",
    ...env,
  };
  return new DevRevSyncConfig({ get: (key: string) => values[key] } as any);
}

function httpError(
  status: number,
  data: any = {},
  headers: Record<string, string> = {}
) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data, headers },
  });
}

describe("DevRevClient", () => {
  let post: jest.SpyInstance;
  let client: DevRevClient;
  let sleeps: number[];
  let logged: string[];

  beforeEach(() => {
    post = jest.spyOn(axios, "post");
    client = new DevRevClient(config());
    sleeps = [];
    jest
      .spyOn(client as any, "sleep")
      .mockImplementation(async (ms: number) => {
        sleeps.push(ms);
      });
    logged = [];
    for (const level of ["log", "warn", "error", "debug"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((message: any) => {
        logged.push(String(message));
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it("posts to the endpoint with the bearer token and returns the body", async () => {
    post.mockResolvedValue({
      status: 200,
      data: { custom_object: { id: "don:1" } },
      headers: {},
    });

    const result = await client.post("custom-objects.create", { a: 1 });

    expect(result).toEqual({ custom_object: { id: "don:1" } });
    expect(post).toHaveBeenCalledWith(
      "https://api.devrev.ai/custom-objects.create",
      { a: 1 },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        timeout: 15000,
      })
    );
  });

  it("waits for Retry-After on a 429, then succeeds", async () => {
    post
      .mockRejectedValueOnce(httpError(429, {}, { "retry-after": "3" }))
      .mockResolvedValueOnce({ status: 200, data: { ok: true }, headers: {} });

    await expect(client.post("rev-users.list", {})).resolves.toEqual({
      ok: true,
    });
    expect(sleeps).toEqual([3000]);
  });

  it("gives up on repeated 5xx with a retryable error", async () => {
    post.mockRejectedValue(httpError(503, { message: "unavailable" }));

    const error = await client
      .post("custom-objects.update", {})
      .catch((e) => e);

    expect(error).toBeInstanceOf(DevRevApiError);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(503);
    expect(post).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([2000, 4000]);
  });

  it("treats network errors as retryable", async () => {
    post.mockRejectedValue(
      Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
    );

    const error = await client.post("links.create", {}).catch((e) => e);

    expect(error.retryable).toBe(true);
    expect(error.status).toBeNull();
  });

  it("does not retry a schema error", async () => {
    post.mockRejectedValue(
      httpError(400, {
        type: "bad_request",
        message: "field 'tnt__colour' not in referenced custom schema",
      })
    );

    const error = await client
      .post("custom-objects.create", {})
      .catch((e) => e);

    expect(post).toHaveBeenCalledTimes(1);
    expect(error.retryable).toBe(false);
    expect(error.isConflict).toBe(false);
  });

  it.each([
    ["unexpected_id_type", "unexpected_id_type: custom_link_type"],
    ["invalid enum", "invalid enum value 'Waitlisted' for field tnt__lifecycle_stage"],
    ["no tenant fragment", "No tenant fragment found for leaf type elp_pathway"],
  ])("does not retry %s", async (_name, message) => {
    post.mockRejectedValue(httpError(400, { message }));

    const error = await client.post("links.create", {}).catch((e) => e);

    expect(post).toHaveBeenCalledTimes(1);
    expect(error.retryable).toBe(false);
  });

  it("does not treat a 400 that mentions unique_key as a conflict", async () => {
    post.mockRejectedValue(
      httpError(400, { message: "unique_key must not be empty" })
    );

    const error = await client
      .post("custom-objects.create", {})
      .catch((e) => e);

    expect(error.isConflict).toBe(false);
  });

  it("recognises a unique_key conflict", async () => {
    post.mockRejectedValue(
      httpError(409, { message: "object with unique key already exists" })
    );

    const error = await client
      .post("custom-objects.create", {})
      .catch((e) => e);

    expect(error.isConflict).toBe(true);
  });

  it("never puts the token in errors or logs", async () => {
    post.mockRejectedValue(httpError(503));

    const error = await client
      .post("custom-objects.create", { title: "t" })
      .catch((e) => e);

    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(logged.join("\n")).not.toContain(TOKEN);
  });

  it("logs each call and its result with keys only, no personal data", async () => {
    post.mockResolvedValue({
      status: 201,
      data: { custom_object: { id: "don:co/1" } },
      headers: { "x-request-id": "req-1" },
    });

    await client.post("custom-objects.create", {
      leaf_type: "learner_profile",
      unique_key: "LRNR:u1",
      custom_fields: { tnt__email: "amina@example.com" },
    });

    expect(logged).toEqual([
      "POST /custom-objects.create calling leaf_type=learner_profile unique_key=LRNR:u1",
      expect.stringMatching(
        /^POST \/custom-objects\.create -> 201 in \d+ms id=don:co\/1 \(request req-1\)$/
      ),
    ]);
    expect(logged.join("\n")).not.toContain("amina@example.com");
  });

  it("logs how many records a list call found", async () => {
    post.mockResolvedValue({
      status: 200,
      data: { rev_users: [{ id: "r1" }] },
      headers: {},
    });

    await client.post("rev-users.list", { external_ref: ["u1"] });

    expect(logged[0]).toBe("POST /rev-users.list calling external_ref=u1");
    expect(logged[1]).toMatch(/-> 200 in \d+ms found=1$/);
  });

  it("logs the final failure as an error", async () => {
    const error = jest.spyOn(Logger.prototype, "error");
    post.mockRejectedValue(httpError(400, { message: "invalid enum" }));

    await client.post("custom-objects.update", { id: "don:co/1" }).catch(() => {
      // expected
    });

    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^POST \/custom-objects\.update failed in \d+ms: .*invalid enum id=don:co\/1$/
      )
    );
  });

  it("calls nothing in dry-run mode and returns well-shaped fakes", async () => {
    const dryRun = new DevRevClient(
      config({ DEVREV_SYNC_DRY_RUN: "true", DEVREV_TOKEN: "" })
    );

    const created = await dryRun.post("custom-objects.create", { title: "t" });
    const listed = await dryRun.post("rev-users.list", {});

    expect(post).not.toHaveBeenCalled();
    expect(idOf(created)).toMatch(/^don:dry-run:/);
    expect(firstArray(listed)).toEqual([]);
  });

  it("masks personal data in the dry-run log", async () => {
    const dryRun = new DevRevClient(
      config({ DEVREV_SYNC_DRY_RUN: "true", DEVREV_TOKEN: "" })
    );

    await dryRun.post("custom-objects.create", {
      title: "Amina Yusuf · ALP-2026-C2",
      unique_key: "LRNR:u1",
      custom_fields: {
        tnt__full_name: "Amina Yusuf",
        tnt__email: "amina@example.com",
        tnt__date_of_birth: "2001-02-03",
        tnt__gender: "female",
        tnt__current_country: "Kenya",
      },
    });

    const line = logged.find((l) => l.startsWith("[dry-run]"));
    expect(line).toContain("LRNR:u1");
    expect(line).toContain("Kenya");
    for (const value of ["Amina", "amina@example.com", "2001-02-03", "female"]) {
      expect(line).not.toContain(value);
    }
  });

  describe("response parsing", () => {
    it("finds the id at the top level or inside the wrapper", () => {
      expect(idOf({ id: "a" })).toBe("a");
      expect(idOf({ custom_object: { id: "b" } })).toBe("b");
      expect(idOf({ rev_user: { id: "c", display_name: "x" } })).toBe("c");
      expect(idOf(null)).toBeUndefined();
    });

    it("finds the array in a list response", () => {
      expect(firstArray({ result: [{ id: "a" }], next_cursor: "x" })).toEqual([
        { id: "a" },
      ]);
      expect(firstArray({})).toEqual([]);
    });
  });
});
