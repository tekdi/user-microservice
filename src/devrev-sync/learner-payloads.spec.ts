import {
  applicationStatus,
  buildAlpEnrollment,
  buildLearnerProfile,
  buildRevUser,
  enrollmentKeys,
  EnrollmentSource,
  isEnrolled,
  learnerProfileUniqueKey,
  LearnerSource,
  lifecycleStage,
  normalizeFieldName,
  payloadHash,
  profileFieldFor,
  toBool,
  toCustomFields,
  toDate,
} from "./learner-payloads";

const USER_ID = "6f1c2a3b-0000-4000-8000-000000000001";
const COHORT_ID = "c0000000-0000-4000-8000-000000000002";

function learner(overrides: Partial<LearnerSource> = {}): LearnerSource {
  return {
    userId: USER_ID,
    firstName: "Amina",
    middleName: null,
    lastName: "Okafor",
    email: "amina@example.com",
    gender: "female",
    dob: new Date("2001-04-09T00:00:00Z"),
    currentCountry: "Kenya",
    createdAt: new Date("2026-01-02T08:30:00Z"),
    temporaryPassword: false,
    applicationCountry: "Nigeria",
    customFields: {},
    ...overrides,
  };
}

function enrollment(
  overrides: Partial<EnrollmentSource> = {}
): EnrollmentSource {
  return {
    cohortId: COHORT_ID,
    cohortName: "ALP-2026-C2",
    status: "shortlisted",
    createdAt: new Date("2026-02-10T10:00:00Z"),
    updatedAt: new Date("2026-03-01T10:00:00Z"),
    ...overrides,
  };
}

describe("learner payloads", () => {
  describe("keys", () => {
    it("match the agreed DevRev formats", () => {
      expect(learnerProfileUniqueKey(USER_ID)).toBe(`LRNR:${USER_ID}`);
      expect(enrollmentKeys(USER_ID, COHORT_ID)).toEqual({
        externalId: `${USER_ID}:${COHORT_ID}`,
        uniqueKey: `ALPE:${USER_ID}:${COHORT_ID}`,
      });
    });
  });

  describe("status mapping", () => {
    it.each([
      ["applied", "Pending", false, "Applied"],
      ["submitted", "Pending", false, "Applied"],
      ["shortlisted", "Shortlisted", true, "Shortlisted"],
      ["active", "Shortlisted", true, "Shortlisted"],
      ["dropout", "Shortlisted", false, "Withdrawn"],
      ["rejected", "Rejected", false, "Rejected"],
      ["inactive", undefined, undefined, undefined],
      ["archived", undefined, undefined, undefined],
    ])(
      "%s -> application_status %s, is_enrolled %s, lifecycle_stage %s",
      (status, application, enrolled, stage) => {
        expect(applicationStatus(status)).toBe(application);
        expect(isEnrolled(status)).toBe(enrolled);
        expect(lifecycleStage(status)).toBe(stage);
      }
    );

    it("uses only values DevRev allows", () => {
      const statuses = ["applied", "submitted", "shortlisted", "active", "dropout", "rejected"];
      const allowedApplication = ["Pending", "Shortlisted", "Rejected"];
      const allowedStage = [
        "Applied", "Rejected", "Shortlisted", "Enrolled - Not Started", "In Progress",
        "Completed", "Passed", "Failed - Final Assessment", "Failed - Masterclass", "Withdrawn",
      ];
      for (const status of statuses) {
        expect(allowedApplication).toContain(applicationStatus(status));
        expect(allowedStage).toContain(lifecycleStage(status));
      }
    });

    it("is case-insensitive and tolerates empty input", () => {
      expect(applicationStatus("SHORTLISTED")).toBe("Shortlisted");
      expect(lifecycleStage(undefined as any)).toBeUndefined();
    });
  });

  describe("value helpers", () => {
    it("formats dates as YYYY-MM-DD and drops invalid ones", () => {
      expect(toDate(new Date("2026-03-16T23:00:00Z"))).toBe("2026-03-16");
      expect(toDate("2001-04-09")).toBe("2001-04-09");
      expect(toDate("not a date")).toBeUndefined();
      expect(toDate(null)).toBeUndefined();
    });

    it("reads yes/no answers as booleans", () => {
      expect(toBool("Yes")).toBe(true);
      expect(toBool("no")).toBe(false);
      expect(toBool("maybe")).toBeUndefined();
    });

    it("prefixes custom fields and drops empty values", () => {
      expect(
        toCustomFields({
          cohort: "ALP-2026-C2",
          email: "",
          week: 0,
          passed: false,
          missing: undefined,
          nothing: null,
        })
      ).toEqual({
        tnt__cohort: "ALP-2026-C2",
        tnt__week: 0,
        tnt__passed: false,
      });
    });

    it("hashes payloads independently of key order", () => {
      expect(payloadHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
        payloadHash({ b: { d: 3, c: 2 }, a: 1 })
      );
      expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
    });
  });

  describe("buildRevUser", () => {
    it("sends only standard Rev User fields", () => {
      expect(buildRevUser(learner(), "don:identity:org/1")).toEqual({
        display_name: "Amina Okafor",
        external_ref: USER_ID,
        rev_org: "don:identity:org/1",
        email: "amina@example.com",
      });
    });

    it("falls back to the user ID and omits a missing email", () => {
      const body = buildRevUser(
        learner({ firstName: null, lastName: null, email: null }),
        "org"
      );
      expect(body.display_name).toBe(USER_ID);
      expect(body).not.toHaveProperty("email");
    });
  });

  describe("buildLearnerProfile", () => {
    it("maps the user columns this service owns", () => {
      expect(buildLearnerProfile(learner(), "don:identity:revu/9")).toEqual({
        aspire_user_id: USER_ID,
        full_name: "Amina Okafor",
        email: "amina@example.com",
        rev_user_id: "don:identity:revu/9",
        gender: "female",
        date_of_birth: "2001-04-09",
        application_country: "Nigeria",
        current_country: "Kenya",
        registration_date: "2026-01-02",
        is_activated: true,
      });
    });

    it("never sends the unowned summary fields", () => {
      const fields = buildLearnerProfile(learner(), null);
      for (const name of [
        "is_alumni",
        "latest_alp_cohort",
        "latest_alp_status",
        "alp_graduation_cohort",
        "activation_date",
        "elp_activated",
      ]) {
        expect(fields).not.toHaveProperty(name);
      }
    });

    it("treats a still-temporary password as not activated", () => {
      expect(
        buildLearnerProfile(learner({ temporaryPassword: true }), null)
          .is_activated
      ).toBe(false);
    });

    it("maps only known custom fields and parses the boolean ones", () => {
      const fields = buildLearnerProfile(
        learner({
          customFields: {
            university: " University of Nairobi ",
            first_generation: "Yes",
            limited_income: "No",
            favourite_colour: "green",
          },
        }),
        null
      );
      expect(fields.university).toBe("University of Nairobi");
      expect(fields.first_generation).toBe(true);
      expect(fields.limited_income).toBe(false);
      expect(fields).not.toHaveProperty("favourite_colour");
    });

    it("leaves out and reports a yes/no answer it can't read", () => {
      const unknown: string[] = [];
      const fields = buildLearnerProfile(
        learner({ customFields: { limited_income: "Pune", study_major: "" } }),
        null,
        (field) => unknown.push(field)
      );
      expect(fields.limited_income).toBeUndefined();
      expect(fields.study_major).toBeUndefined();
      expect(unknown).toEqual(["limited_income"]);
    });
  });

  describe("custom field names", () => {
    const map = {
      first_generation: ["iamfirstgenerationtogotouniversity"],
      university: ["nameofyourcurrentormostrecentuniversity"],
      limited_income: ["icomefromalimitedincome", "icomefromalimitedincomebackground"],
    };

    it("normalizes case and punctuation", () => {
      expect(normalizeFieldName("iAmFirst-GenerationToGoToUniversity.")).toBe(
        "iamfirstgenerationtogotouniversity"
      );
    });

    it("matches every cohort's copy of a field by name prefix", () => {
      expect(profileFieldFor("iAmFirstGenerationToGoToUniversity", map)).toBe(
        "first_generation"
      );
      expect(
        profileFieldFor(
          "iAmFirstGenerationToGoToUniversityDescriptionFirstGenerationMeans",
          map
        )
      ).toBe("first_generation");
      expect(
        profileFieldFor("nameOfYourCurrentOrMostRecentUniversity/college", map)
      ).toBe("university");
    });

    it("ignores fields that match nothing", () => {
      expect(profileFieldFor("universityWebsite", map)).toBeUndefined();
      expect(profileFieldFor("", map)).toBeUndefined();
    });
  });

  describe("buildAlpEnrollment", () => {
    it("sends only the fields this service owns", () => {
      const fields = buildAlpEnrollment(
        learner(),
        enrollment(),
        "don:core:profile/1"
      );
      expect(fields).toEqual({
        learner_profile: "don:core:profile/1",
        external_id: `${USER_ID}:${COHORT_ID}`,
        aspire_user_id: USER_ID,
        cohort: "ALP-2026-C2",
        application_date: "2026-02-10",
        application_status: "Shortlisted",
        is_enrolled: true,
        lifecycle_stage: "Shortlisted",
        withdrawal_date: undefined,
      });
    });

    it("sets the withdrawal date only for dropouts", () => {
      const fields = buildAlpEnrollment(
        learner(),
        enrollment({ status: "dropout" }),
        null
      );
      expect(fields.withdrawal_date).toBe("2026-03-01");
      expect(fields.lifecycle_stage).toBe("Withdrawn");
      expect(fields.is_enrolled).toBe(false);
    });

    it("never sends LMS-owned or unowned fields", () => {
      const fields = buildAlpEnrollment(learner(), enrollment(), null);
      for (const name of [
        "is_latest_attempt",
        "alp_progress",
        "orientation_progress",
        "completion_date",
        "final_assessment_score",
        "masterclasses_attended",
      ]) {
        expect(fields).not.toHaveProperty(name);
      }
    });
  });
});
