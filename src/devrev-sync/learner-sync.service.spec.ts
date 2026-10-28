import { DevRevApiError } from "./devrev.client";
import { DevRevSyncConfig } from "./devrev-sync.config";
import { DevRevLeafType } from "./entities/devrev-sync.entity";
import { LearnerSnapshot } from "./learner-source.loader";
import { LearnerSyncError, LearnerSyncService } from "./learner-sync.service";

const USER_ID = "6f1c2a3b-0000-4000-8000-000000000001";
const PROFILE_LINK = "don:core:dvrv-in-1:devo/test:custom_link_type/5";
const RECORD_LINK = "don:core:dvrv-in-1:devo/test:custom_link_type/3";

const BASE_ENV = {
  DEVREV_SYNC_ENABLED: "true",
  DEVREV_TOKEN: "t",
  DEVREV_REV_ORG_ID: "don:identity:org/1",
  DEVREV_LINK_TYPE_PROFILE_ID: PROFILE_LINK,
  DEVREV_LINK_TYPE_RECORD_ID: RECORD_LINK,
};

function config(env: Record<string, string> = {}): DevRevSyncConfig {
  const values: Record<string, string> = { ...BASE_ENV, ...env };
  return new DevRevSyncConfig({ get: (key: string) => values[key] } as any);
}

function snapshot(overrides: Partial<LearnerSnapshot> = {}): LearnerSnapshot {
  return {
    isStudent: true,
    learner: {
      userId: USER_ID,
      firstName: "Amina",
      middleName: null,
      lastName: "Okafor",
      email: "amina@example.com",
      gender: "female",
      dob: "2001-04-09",
      currentCountry: "Kenya",
      createdAt: new Date("2026-01-02T08:30:00Z"),
      temporaryPassword: false,
      applicationCountry: "Nigeria",
      customFields: {},
    },
    enrollments: [
      {
        cohortId: "c2",
        cohortName: "ALP-2026-C4",
        status: "shortlisted",
        createdAt: null,
        updatedAt: null,
        isLatest: true,
      },
      {
        cohortId: "c1",
        cohortName: "ALP-2026-C1",
        status: "dropout",
        createdAt: null,
        updatedAt: null,
        isLatest: false,
      },
    ],
    ...overrides,
  };
}

describe("LearnerSyncService", () => {
  let loader: { load: jest.Mock };
  let records: {
    upsertRevUser: jest.Mock;
    upsertCustomObject: jest.Mock;
    ensureLink: jest.Mock;
  };

  const service = (env: Record<string, string> = {}) =>
    new LearnerSyncService(config(env), loader as any, records as any);

  beforeEach(() => {
    loader = { load: jest.fn().mockResolvedValue(snapshot()) };
    records = {
      upsertRevUser: jest.fn().mockResolvedValue({ devrevId: "don:revu/1" }),
      upsertCustomObject: jest.fn(async (input) => ({
        devrevId: `don:${input.leafType}/${input.externalId}`,
      })),
      ensureLink: jest.fn().mockResolvedValue(undefined),
    };
  });

  it("syncs Rev User, profile and every ALP enrollment, linking each to the Rev User", async () => {
    const result = await service().syncLearner(USER_ID);

    expect(result).toEqual({
      userId: USER_ID,
      outcome: "synced",
      enrollments: 2,
    });
    expect(records.upsertRevUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ external_ref: USER_ID })
    );

    const [profileCall, latestCall, earlierCall] =
      records.upsertCustomObject.mock.calls.map(([input]) => input);
    expect(profileCall).toMatchObject({
      leafType: DevRevLeafType.LEARNER_PROFILE,
      uniqueKey: `LRNR:${USER_ID}`,
      lookupField: "aspire_user_id",
    });
    expect(profileCall.fields).toMatchObject({ rev_user_id: "don:revu/1" });
    expect(profileCall.fields).not.toHaveProperty("latest_alp_cohort");
    expect(latestCall).toMatchObject({
      uniqueKey: `ALPE:${USER_ID}:ALP-2026-C4`,
      cohortId: "c2",
    });
    expect(latestCall.fields).toMatchObject({
      learner_profile: `don:learner_profile/${USER_ID}`,
      is_latest_attempt: true,
    });
    expect(earlierCall.fields).toMatchObject({
      is_latest_attempt: false,
      lifecycle_stage: "Withdrawn",
    });

    expect(
      records.ensureLink.mock.calls.map(([, revUser, linkType]) => [
        revUser,
        linkType,
      ])
    ).toEqual([
      ["don:revu/1", PROFILE_LINK],
      ["don:revu/1", RECORD_LINK],
      ["don:revu/1", RECORD_LINK],
    ]);
  });

  it.each([
    ["sync disabled", { DEVREV_SYNC_ENABLED: "false" }, snapshot()],
    ["user not found", {}, null],
    ["not a student", {}, snapshot({ isStudent: false })],
    [
      "no membership in an allowed cohort",
      { DEVREV_SYNC_COHORT_ALLOWLIST: "c9" },
      snapshot({ enrollments: [] }),
    ],
  ])("skips when %s", async (reason, env, loaded) => {
    loader.load.mockResolvedValue(loaded);

    const result = await service(env as Record<string, string>).syncLearner(
      USER_ID
    );

    expect(result).toMatchObject({ outcome: "skipped", reason });
    expect(records.upsertCustomObject).not.toHaveBeenCalled();
  });

  it("respects the per-type switches", async () => {
    await service({
      DEVREV_SYNC_REV_USERS: "false",
      DEVREV_SYNC_ALP_ENROLLMENT: "false",
    }).syncLearner(USER_ID);

    expect(records.upsertRevUser).not.toHaveBeenCalled();
    expect(records.upsertCustomObject).toHaveBeenCalledTimes(1);
    expect(
      records.upsertCustomObject.mock.calls[0][0].fields.rev_user_id
    ).toBeUndefined();
  });

  it("skips Rev Users when no rev org is configured", async () => {
    await service({ DEVREV_REV_ORG_ID: "" }).syncLearner(USER_ID);

    expect(records.upsertRevUser).not.toHaveBeenCalled();
  });

  it("keeps going after one enrollment fails, then fails the job", async () => {
    records.upsertCustomObject
      .mockImplementationOnce(async () => ({ devrevId: "don:profile" }))
      .mockRejectedValueOnce(
        new DevRevApiError("bad enum", "x", 400, false, null, null, null)
      )
      .mockImplementationOnce(async () => ({ devrevId: "don:enr" }));

    const error = await service()
      .syncLearner(USER_ID)
      .catch((e) => e);

    expect(records.upsertCustomObject).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(LearnerSyncError);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("bad enum");
  });

  it("marks the failure retryable when any part can be retried, keeping the longest Retry-After", async () => {
    records.upsertCustomObject
      .mockImplementationOnce(async () => ({ devrevId: "don:profile" }))
      .mockRejectedValueOnce(
        new DevRevApiError("rate limited", "x", 429, true, 20000, null, null)
      )
      .mockRejectedValueOnce(
        new DevRevApiError("bad enum", "x", 400, false, null, null, null)
      );

    const error = await service()
      .syncLearner(USER_ID)
      .catch((e) => e);

    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(20000);
  });
});
