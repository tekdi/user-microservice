import { DevRevSyncConfig } from "./devrev-sync.config";

const PROFILE = "don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/5";
const RECORD = "don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/3";

function config(env: Record<string, string> = {}): DevRevSyncConfig {
  return new DevRevSyncConfig({ get: (key: string) => env[key] } as any);
}

describe("DevRevSyncConfig", () => {
  describe("token", () => {
    it("reads DEVREV_API_TOKEN", () => {
      expect(config({ DEVREV_API_TOKEN: "a" }).token).toBe("a");
    });

    it("falls back to DEVREV_TOKEN", () => {
      expect(config({ DEVREV_TOKEN: "b" }).token).toBe("b");
    });

    it("prefers DEVREV_API_TOKEN when both are set", () => {
      expect(
        config({ DEVREV_API_TOKEN: "a", DEVREV_TOKEN: "b" }).token
      ).toBe("a");
    });
  });

  describe("link type IDs", () => {
    it("accepts custom_link_type IDs", () => {
      const c = config({
        DEVREV_LINK_TYPE_PROFILE_ID: PROFILE,
        DEVREV_LINK_TYPE_RECORD_ID: RECORD,
      });
      expect(c.profileLinkTypeId).toBe(PROFILE);
      expect(c.recordLinkTypeId).toBe(RECORD);
      expect(c.errors).toEqual([]);
    });

    it("rejects a schema ID", () => {
      const c = config({
        DEVREV_LINK_TYPE_PROFILE_ID:
          "don:core:dvrv-in-1:devo/2qphGDPJVV:tenant_fragment/503",
      });
      expect(c.profileLinkTypeId).toBe("");
      expect(c.errors).toEqual([
        expect.stringContaining("DEVREV_LINK_TYPE_PROFILE_ID is not a custom_link_type ID"),
      ]);
    });

    it("rejects a value with the key pasted in front", () => {
      const c = config({
        DEVREV_LINK_TYPE_RECORD_ID: `DEVREV_LINK_TYPE_RECORD_ID=${RECORD}`,
      });
      expect(c.recordLinkTypeId).toBe("");
      expect(c.errors).toHaveLength(1);
    });

    it("rejects the deprecated custom_link_type/4", () => {
      const c = config({
        DEVREV_LINK_TYPE_RECORD_ID:
          "don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/4",
      });
      expect(c.recordLinkTypeId).toBe("");
      expect(c.errors).toEqual([expect.stringContaining("deprecated")]);
    });

    it("rejects the same ID for both link types", () => {
      const c = config({
        DEVREV_LINK_TYPE_PROFILE_ID: PROFILE,
        DEVREV_LINK_TYPE_RECORD_ID: PROFILE,
      });
      expect(c.profileLinkTypeId).toBe("");
      expect(c.recordLinkTypeId).toBe("");
      expect(c.errors).toEqual([expect.stringContaining("are the same")]);
    });

    it("leaves unset IDs empty without an error", () => {
      const c = config();
      expect(c.profileLinkTypeId).toBe("");
      expect(c.errors).toEqual([]);
    });
  });

  describe("switches", () => {
    it("is off by default", () => {
      expect(config().enabled).toBe(false);
      expect(config({ DEVREV_API_TOKEN: "a" }).canRun).toBe(false);
    });

    it("runs in dry-run without a token", () => {
      expect(
        config({ DEVREV_SYNC_ENABLED: "true", DEVREV_SYNC_DRY_RUN: "true" })
          .canRun
      ).toBe(true);
    });

    it("needs a token when live", () => {
      expect(config({ DEVREV_SYNC_ENABLED: "true" }).canRun).toBe(false);
      expect(
        config({ DEVREV_SYNC_ENABLED: "true", DEVREV_TOKEN: "t" }).canRun
      ).toBe(true);
    });
  });

  describe("DEVREV_PROFILE_FIELD_MAP", () => {
    it("normalizes field names and accepts a single name or a list", () => {
      const c = config({
        DEVREV_PROFILE_FIELD_MAP: JSON.stringify({
          first_generation: ["iAmFirst-GenerationToGoToUniversity."],
          study_major: "fieldOfStudy",
        }),
      });
      expect(c.profileFieldMap).toEqual({
        first_generation: ["iamfirstgenerationtogotouniversity"],
        study_major: ["fieldofstudy"],
      });
      expect(c.warnings).toEqual([]);
    });

    it("drops targets this service doesn't fill", () => {
      const c = config({
        DEVREV_PROFILE_FIELD_MAP: JSON.stringify({
          is_alumni: ["x"],
          university: [],
        }),
      });
      expect(c.profileFieldMap).toEqual({});
      expect(c.warnings).toHaveLength(2);
    });

    it("warns when the value is not a JSON object", () => {
      const c = config({ DEVREV_PROFILE_FIELD_MAP: "[1,2]" });
      expect(c.profileFieldMap).toEqual({});
      expect(c.warnings).toEqual([expect.stringContaining("not a JSON object")]);
    });
  });
});
