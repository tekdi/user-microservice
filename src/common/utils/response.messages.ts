export const API_RESPONSES = {
  USERNAME_NOT_FOUND: "Username does not exist",
  USER_NOT_FOUND: "User does not exist",
  FORGOT_PASSWORD_SUCCESS: "Forgot password Reset successfully",
  EMAIL_NOT_FOUND_FOR_RESET:
    "EmailId does not exist for sending Reset password link",
  RESET_PASSWORD_LINK_FAILED:
    "Failed to send the reset password link. Please try again later.",
  RESET_PASSWORD_LINK_SUCCESS:
    "Reset password link has been sent successfully. Please check your email.",
  NOT_FOUND: "Not Found",
  BAD_REQUEST: "Bad Request",
  INVALID_LINK: "Invalid Link",
  LINK_EXPIRED: "The link is expired. Please request a new one.",
  SERVICE_UNAVAILABLE:
    "Notification service is unreachable. Please try again later.",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
  ERROR: "Error occurred",
  UNEXPECTED_ERROR: "An unexpected error occurred",
  ACADEMICYEAR: "Academic Year Created Successfully",
  ACADEMICYEAR_EXIST: "Academic Year Already Exist",
  ACADEMICYEAR_YEAR: "Already Exist",
  ACADEMICYEAR_NOTFOUND: "Academic Year Not Found",
  ACADEMICYEAR_GET_SUCCESS: "Get Successfully",
  STARTDATE_VALIDATION: "start Date should not less than current date",
  ENDDATE_VALIDATION: "End Date shluld not less than startDate",
  TENANTID_VALIDATION: "Tenant ID is required and must be a valid UUID",
  COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR:
    "No cohorts available for given Academic year",
  ACADEMICYEARID_VALIDATION:
    "Academic Year ID is required and must be a valid UUID",
  ACADEMICYEAR_NOT_FOUND: "Academic Year Not Found",
  ACADEMICYEAR_COHORT_NOT_FOUND: "This cohort not exist for this year",
  COHORTMEMBER_CREATED_SUCCESSFULLY:
    "Cohort member has been successfully assigned.",
  CONFLICT: "CONFLICT",
  INVALID_USERID: "Invalid input: User Id does not exist.",
  INVALID_COHORTID: "Invalid input: Cohort Id does not exist.",
  TENANT_ID_NOTFOUND: '"Invalid input: TenantId must be a valid UUID."',
  COHORT_NOTFOUND: "Cohort not exist for this year.",
  USER_NOTFOUND: "User not exist for this year.",
  USER_DETAIL_NOTFOUND: "User Deatil not found",
  COHORT_GET_SUCCESSFULLY: "Cohort members details fetched successfully.",
  COHORT_USER_NOTFOUND: "User not exist in this cohort for this year.",
  COHORTMEMBER_ERROR: "Cohort Members Created with some errors",
  COHORTMEMBER_SUCCESSFULLY: "Cohort Members Created Successfully",
  COHORT_NOT_IN_ACADEMIC_YEAR: "Cohort ID does not belong in Academic year",
  USER_NOT_IN_ACADEMIC_YEAR: "User ID does not belong in Academic year",
  TANANT_ID_REQUIRED: "Tenanat Id required",
  COHORT_VALID_UUID: "Invalid input: CohortId must be a valid UUID.",
  COHORT_MEMBER_GET_SUCCESSFULLY:
    "Cohort members details fetched successfully.",
  COHORTMEMBER_NOTFOUND: "Invalid input: Cohort Member not exist.",
  COHORTID_NOTFOUND_FOT_THIS_YEAR: (cohortId) =>
    `Cohort with cohortId ${cohortId} does not exist for this academic year`,
  MAPPING_EXIST_BW_USER_AND_COHORT: (userId, cohortId) =>
    `Mapping already exists for userId ${userId} and cohortId ${cohortId} for this academic year`,
  COHORT_NOTMAPPED_WITH_USER: (removeCohortId, userId) =>
    `Cohort Id ${removeCohortId} is not mapped to user Id${userId}} for this academic year`,
  COHORT_STATUS_UPDATED_FOR_USER: (removeCohortId, userId) =>
    `Cohort Id ${removeCohortId} status updated for This user Id${userId}}`,
  ERROR_UPDATE_COHORTMEMBER: (userId, removeCohortId, error) =>
    `Error updating cohort member with userId ${userId} and cohortId ${removeCohortId}: ${error}`,
  ERROR_SAVING_COHORTMEMBER: (userId, cohortId, error) =>
    `Error saving cohort member with userId ${userId} and cohortId ${cohortId}: ${error}`,
  USER_NOTEXIST: (userId) =>
    `User with userId ${userId} does not exist for this academic year.`,
};
