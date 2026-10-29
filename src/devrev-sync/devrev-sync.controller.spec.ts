import { DevRevSyncController } from "./devrev-sync.controller";

const USER_ID = "6f1c2a3b-0000-4000-8000-000000000001";
const COHORT_ID = "c0000000-0000-4000-8000-000000000002";

/** Minimal Express response that records what the handler sent. */
function response() {
  const res: any = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: any) => {
    res.body = body;
    return res;
  });
  return res;
}

describe("DevRevSyncController", () => {
  let queue: {
    isRunning: boolean;
    enqueueLearners: jest.Mock;
    jobCounts: jest.Mock;
  };
  let records: { markForResync: jest.Mock; userIdsToRetry: jest.Mock };
  let loader: { userIdsInCohort: jest.Mock };
  let controller: DevRevSyncController;

  beforeEach(() => {
    queue = {
      isRunning: true,
      enqueueLearners: jest.fn(async (ids: string[]) => ids.length),
      jobCounts: jest.fn(async () => ({})),
    };
    records = {
      markForResync: jest.fn(async () => 1),
      userIdsToRetry: jest.fn(async () => ["u1", "u2"]),
    };
    loader = { userIdsInCohort: jest.fn(async () => ["u1", "u2", "u3"]) };
    controller = new DevRevSyncController(
      queue as any,
      records as any,
      loader as any,
      {} as any
    );
  });

  describe("resync", () => {
    it("re-sends one learner in full", async () => {
      const res = response();

      await controller.resync({ userId: USER_ID }, res);

      expect(records.markForResync).toHaveBeenCalledWith([USER_ID]);
      expect(queue.enqueueLearners).toHaveBeenCalledWith([USER_ID]);
      expect(res.statusCode).toBe(200);
      expect(res.body.result).toEqual({ queued: 1 });
    });

    it("re-sends a whole cohort in full", async () => {
      const res = response();

      await controller.resync({ cohortId: COHORT_ID }, res);

      expect(loader.userIdsInCohort).toHaveBeenCalledWith(COHORT_ID);
      expect(records.markForResync).toHaveBeenCalledWith(["u1", "u2", "u3"]);
      expect(res.body.result).toEqual({ queued: 3 });
    });

    it("needs a userId or a cohortId", async () => {
      const res = response();

      await controller.resync({}, res);

      expect(res.statusCode).toBe(400);
      expect(queue.enqueueLearners).not.toHaveBeenCalled();
    });
  });

  describe("backfill", () => {
    it("queues the cohort without clearing payload hashes", async () => {
      const res = response();

      await controller.backfill({ cohortId: COHORT_ID }, res);

      expect(records.markForResync).not.toHaveBeenCalled();
      expect(queue.enqueueLearners).toHaveBeenCalledWith(["u1", "u2", "u3"]);
      expect(res.body.result).toEqual({
        learners: 3,
        queued: 3,
        dryRun: false,
      });
    });

    it("only counts in dry-run", async () => {
      const res = response();

      await controller.backfill({ cohortId: COHORT_ID, dryRun: true }, res);

      expect(queue.enqueueLearners).not.toHaveBeenCalled();
      expect(res.body.result).toEqual({
        learners: 3,
        queued: 0,
        dryRun: true,
      });
    });
  });

  it("retry-failed queues only the learners worth retrying", async () => {
    const res = response();

    await controller.retryFailed(res);

    expect(records.userIdsToRetry).toHaveBeenCalled();
    expect(queue.enqueueLearners).toHaveBeenCalledWith(["u1", "u2"]);
    expect(res.body.result).toEqual({ queued: 2 });
  });

  it.each([
    ["resync", (c: DevRevSyncController, res: any) => c.resync({ userId: USER_ID }, res)],
    ["backfill", (c: DevRevSyncController, res: any) => c.backfill({ cohortId: COHORT_ID }, res)],
    ["retry-failed", (c: DevRevSyncController, res: any) => c.retryFailed(res)],
  ])("%s answers 409 while sync is off", async (_name, call) => {
    queue.isRunning = false;
    const res = response();

    await call(controller, res);

    expect(res.statusCode).toBe(409);
    expect(queue.enqueueLearners).not.toHaveBeenCalled();
  });
});
