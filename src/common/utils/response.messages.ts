export const API_RESPONSES = {
  USERNAME_NOT_FOUND: "Username does not exist",
  EMAIL_EXIST: "Email already exists",
  USER_NOT_FOUND: "User does not exist",
  FORGOT_PASSWORD_SUCCESS: "Forgot password Reset successfully",
  EMAIL_NOT_FOUND_FOR_RESET:
    "EmailId does not exist for sending Reset password link",
  EMAIL_NOT_FOUND: "Email does not exist",
  RESET_PASSWORD_LINK_FAILED:
    "Failed to send the reset password link. Please try again later.",
  RESET_PASSWORD_LINK_SUCCESS:
    "Reset password link has been sent successfully. Please check your email.",
  ACCOUNT_VERIFICATION_LINK_FAILED:
    "Your account is currently inactive and requires verification. We were unable to send the account verification link. Please try again later.",
  ACCOUNT_VERIFICATION_LINK_SUCCESS:
    "Your account is currently inactive and requires verification. The account verification link has been sent successfully.",
  NOT_FOUND: "Not Found",
  BAD_REQUEST: "Bad Request",
  INVALID_LINK: "Invalid Link",
  LINK_EXPIRED: "The link is expired. Please request a new one.",
  SERVICE_UNAVAILABLE:
    "Notification service is unreachable. Please try again later.",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
  FORBIDDEN: "Forbidden",
  ERROR: "Error occurred",
  UNEXPECTED_ERROR: "An unexpected error occurred",
  ACADEMICYEAR: "Academic Year Created Successfully",
  ACADEMICYEAR_EXIST: "Academic Year Already Exist",
  ACADEMICYEAR_YEAR: "Already Exist",
  ACADEMICYEAR_NOTFOUND: "Academic Year Not Found",
  ACADEMICYEAR_GET_SUCCESS: "Get Successfully",
  STARTDATE_VALIDATION: "start Date should not less than current date",
  ENDDATE_VALIDATION:
    "End Date should not be earlier than Start Date and can be equal to it.",
  TENANTID_VALIDATION: "Tenant ID is required and must be a valid UUID",
  ORGANISATIONID_REQUIRED:
    "Organisation ID is required (set organisationid header or DEFAULT_ORGANISATION_ID environment variable).",
  ORGANISATIONID_VALIDATION: "Organisation ID must be a valid UUID when provided.",
  COHORT_NOT_AVAILABLE_FOR_ACADEMIC_YEAR:
    "No cohorts available for given Academic year",
  ACADEMICYEARID_VALIDATION:
    "Academic Year ID is required and must be a valid UUID",
  ACADEMICYEAR_NOT_FOUND: "Academic Year Not Found",
  ACADEMICYEAR_COHORT_NOT_FOUND: "This cohort not exist for this year",
  COHORTMEMBER_CREATED_SUCCESSFULLY:
    "Cohort member has been successfully assigned.",
  COHORT_MEMBER_REACTIVATED: "Cohort member has been successfully reactivated.",
  CONFLICT: "CONFLICT",
  INVALID_USERID: "Invalid input: User Id does not exist.",
  INVALID_COHORTID: "Invalid input: Cohort Id does not exist.",
  TENANT_ID_NOTFOUND: '"Invalid input: TenantId must be a valid UUID."',
  COHORT_NOTFOUND: "Cohort not exist for this year.",
  USER_NOTFOUND: "User not exist for this year.",
  USER_DETAIL_NOTFOUND: "User details not found",
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
  ACADEMICYEAR_GET_SUCCESSFULLY: "Get Successfully Academic year list",
  FORM_CREATED_SUCCESSFULLY: "Form created successfully",
  FORM_UPDATED_SUCCESSFULLY: "Form updated successfully.",
  FORM_NOT_FOUND: "Form not found with the given ID.",
  ADD_COHORT_TO_ACADEMIC_YEAR: "Cohort added with academic year successfully",
  COHORT_NOT_FOUND: "Cohort not found",
  FORM_EXISTS: "Form already exists",
  INVALID_FORM: "Invalid form",
  TENANTID_MISMATCHED: "Tenant id mismatched",
  INVALID_CONTEXT: (context) => `Invalid context: ${context}`,
  INVALID_CONTEXTTYPE: (context, validContextTypes) =>
    `Invalid contextType. For the context '${context}', it must be one of: ${validContextTypes}`,
  COHORTID_NOTFOUND_FOT_THIS_YEAR: (cohortId) =>
    `Cohort with cohortId ${cohortId} does not exist for this academic year.`,
  MAPPING_EXIST_BW_USER_AND_COHORT: (userId, cohortId) =>
    `Mapping already exists for userId ${userId} and cohortId ${cohortId} for this academic year`,
  COHORT_NOTMAPPED_WITH_USER: (removeCohortId, userId) =>
    `Cohort Id ${removeCohortId} is not mapped to user Id${userId}} for this academic year.`,
  COHORT_STATUS_UPDATED_FOR_USER: (removeCohortId, userId) =>
    `Cohort Id ${removeCohortId} status updated for This user Id${userId}}`,
  ERROR_UPDATE_COHORTMEMBER: (userId, removeCohortId, error) =>
    `Error updating cohort member with userId ${userId} and cohortId ${removeCohortId}: ${error}`,
  ERROR_SAVING_COHORTMEMBER: (userId, cohortId, error) =>
    `Error saving cohort member with userId ${userId} and cohortId ${cohortId}: ${error}`,
  USER_NOTEXIST: (userId) =>
    `User with userId ${userId} does not exist for this academic year.`,
  UNAUTHORIZED: "Unauthorized",
  INVALID_TOKEN: "Token Invalid",

  //User Api messages
  USER_UPDATED_SUCCESSFULLY: "User updated successfully.",
  USER_NOT_EXISTS: "User does not exist.",
  USER_EXISTS: "User already exist.",
  DUPLICATE_DATA: "Duplicate data.",
  USER_ALREADY_EXISTS: "User already exists.",
  SERVER_ERROR: "Internal server error",
  SERVICE_NAME: "User service",

  USER_NOT_FOUND_FOR_DELETE: "User not found for delete.",
  USER_NOT_FOUND_FOR_PASSWORD_RESET: "User not found for password reset.",

  //get User Details
  USER_GET_SUCCESSFULLY: "User details fetched successfully.",
  USER_GET_BY_EMAIL_SUCCESSFULLY: "User details fetched successfully by email",
  USER_GET_BY_PHONE_SUCCESSFULLY: "User details fetched successfully by phone",
  USER_GET_BY_USERNAME_SUCCESSFULLY:
    "User details fetched successfully by username",
  USER_GET_BY_TENANT_ID_SUCCESSFULLY:
    "User details fetched successfully by tenantId",
  USER_GET_BY_USER_ID_SUCCESSFULLY:
    "User details fetched successfully by userId",
  USER_GET_BY_USER_ID_AND_TENANT_ID_SUCCESSFULLY:
    "User details fetched successfully by userId and tenantId",
  USER_GET_BY_EMAIL_AND_TENANT_ID_SUCCESSFULLY:
    "User details fetched successfully by email and tenantId",
  USER_CREATE_KEYCLOAK: "User created successfully on keycloak",
  USERNAME_EXISTS_KEYCLOAK: "Username is already exists in keycloak",
  UPDATE_USER_KEYCLOAK_ERROR: "Failed to update username details in Keycloak.",

  //Create user
  USER_CREATE_SUCCESSFULLY: `User created successfully`,
  USER_CREATE_IN_DB: "User created in user table successfully",
  USER_CREATE_FAILED: "User creation failed",
  USER_CREATE_FAILED_WITH_ERROR: (error) =>
    `User creation failed with error: ${error}`,
  USER_CREATE_FAILED_WITH_ERROR_AND_EMAIL: (error, email) =>
    `User creation failed with error: ${error}. Email: ${email}`,
  USER_CREATE_FAILED_WITH_ERROR_AND_PHONE: (error, phone) =>
    `User creation failed with error: ${error}. Phone: ${phone}`,
  USER_CREATE_FAILED_WITH_ERROR_AND_USERNAME: (error, username) =>
    `User creation failed with error: ${error}. Username: ${username}`,
  USERID_NOT_FOUND: (userId) => `User Id '${userId}' does not exist.`,
  TENANTID_NOT_FOUND: (tenantId) => `Tenant Id '${tenantId}' does not exist.`,

  //UUID constants
  UUID_VALIDATION: "Please enter valid UUID",
  INVALID_EMAIL: (emailId) => `Invalid email address: ${emailId}`,
  MOBILE_NO_CHECK: (mobileNo) =>
    `Mobile number must be 10 digits long: ${mobileNo}`,
  DOB_FORMAT: (dob) => `Date of birth must be in the format yyyy-mm-dd: ${dob}`,
  INVALID_USERNAME_EMAIL: `Invalid Username Or Email`,
  USER_RELATEDENTITY_DELETE: `User and related entries deleted Successfully.`,

  ACADEMIC_YEAR_NOT_FOUND: "Academic year not found for tenant",
  DUPLICAT_TENANTID:
    "Duplicate tenantId detected. Please ensure each tenantId is unique and correct your data.",
  INVALID_PARAMETERS:
    "Invalid parameters provided. Please ensure that tenantId, roleId, and cohortId (if applicable) are correctly provided.",
  COHORT_NOT_FOUND_IN_TENANT_ID: (cohortId, TenantId) =>
    `Cohort Id '${cohortId}' does not exist for this tenant '${TenantId}'.`,

  ROLE_NOT_FOUND_IN_TENANT: (roleId, tenantId) =>
    `Role Id '${roleId}' does not exist for this tenant '${tenantId}'.`,
  USER_EXISTS_SEND_MAIL: "User Exists. Proceed with Sending Email.",
  INVALID_FIELD: (invalidateFields) =>
    `Invalid fields found: ${invalidateFields}`,
  DUPLICATE_FIELD: (duplicateFieldKeys) =>
    `Duplicate fieldId detected: ${duplicateFieldKeys}`,
  FIELD_NOT_FOUND: "Field not found",
  PASSWORD_RESET: "Password reset successful!",

  SOMETHING_WRONG: "Something went wrong",
  USER_PASSWORD_UPDATE: "User Password Updated Successfully",
  USER_BASIC_DETAILS_UPDATE: "User basic details updated successfully",
  USER_TENANT: "User tenant mapping successfully",
  USER_COHORT: "User cohort mapping successfully",
  COHORT_NAME_EXIST: "Cohort name already exist.Please provide another name.",

  COHORT_LIST: "Cohort list fetched successfully",
  COHORT_HIERARCHY: "Cohort hierarchy fetched successfully",
  COHORT_EXISTS: "Cohort already exists",
  CREATE_COHORT: "Cohort Created Successfully.",
  COHORT_FIELD_DETAILS: "Fetch cohort custom field details",
  CHILD_DATA: "Get all child data response",
  COHORT_DATA_RESPONSE: "Fetch cohort data response",
  COHORT_UPDATED_SUCCESSFULLY: "Cohort updated successfully.",
  TENANT_NOTFOUND: "Tenant not found",
  COHORTMEMBER_UPDATE_SUCCESSFULLY: "Cohort Member updated Successfully",

  //Tenant
  TENANT_GET: "Tenant fetched successfully.",
  TENANT_NOT_FOUND: "No tenants found matching the specified criteria.",
  TENANT_EXISTS: "Tenant already exists",
  TENANT_CREATE: "Tenant created successfully",
  TENANT_UPDATE: "Tenant updated successfully",
  TENANT_DELETE: "Tenant deleted successfully",
  TENANT_SEARCH_SUCCESS: "Tenant search successfully",
  TENANT_CREATE_FAILED: "Failed to create tenant, please try again.",
  REQUIRED_AND_UUID: "tenantId is required and it's must be a valid UUID.",

  //OTP
  NOTIFICATION_FAIL_DURING_OTP_SEND:
    "Send SMS notification failed duing OTP send",
  OTP_SEND_SUCCESSFULLY: "OTP sent successfully",
  OTP_EXPIRED: "OTP has expired",
  OTP_INVALID: "OTP invalid",
  OTP_VALID: "OTP validation Sucessfully",
  MOBILE_VALID: "Invalid mobile number. Must be 10 digits.",
  OTP_VALIDED_REQUIRED_KEY: "Missing required fields",
  INVALID_HASH_FORMATE: "Invalid hash format",
  SMS_ERROR: "SMS notification failed",
  SMS_NOTIFICATION_ERROR: "Failed to send SMS notification:",
  USERNAME_REQUIRED: "Username Required",
  INVALID_REASON: "Invalid Reason",
  MOBILE_REQUIRED: "MObile Required",
  INVALID_HASH_FORMAT: "Invalid hash format",
  NOTIFICATION_ERROR:
    "Notification not send due to getting from notification API",
  MOBILE_EMAIL_NOT_FOUND:
    "Mobile number and email ID not found for sending OTP",
  MOBILE_SENT_OTP: "OTP sent successfully to mobile",
  MOBILE_OTP_SEND_FAILED: "Failed to send OTP to mobile",
  EMAIL_SENT_OTP: "OTP sent successfully to email",
  EMAIL_OTP_SEND_FAILED: "Failed to send OTP to email",
  SEND_OTP: "OTP sent successfully",
  EMAIL_NOTIFICATION_ERROR: "Failed to send Email notification:",
  EMAIL_ERROR: "Email notification failed",

  FORM_SUBMISSION_CREATED_SUCCESSFULLY: "Application saved successfully",
  FORM_SUBMISSION_UPDATED_SUCCESSFULLY: "Application updated successfully",
  FORM_SUBMISSION_DELETED_SUCCESSFULLY: "Application deleted successfully",
  FORM_SUBMISSION_NOT_FOUND: "Application not found",

  //Tenant Config
  TENANT_CONFIG_CREATED_SUCCESSFULLY:
    "Tenant configuration created successfully",
  TENANT_CONFIG_UPDATED_SUCCESSFULLY:
    "Tenant configuration updated successfully",
  TENANT_CONFIG_DELETED_SUCCESSFULLY:
    "Tenant configuration deleted successfully",
  TENANT_CONFIG_NOT_FOUND: "Tenant configuration not found",
  CONFIGURATION_NOT_FOUND_FOR_CONTEXT: "Configuration not found for context:",
  TENANT_CONFIG_RETRIEVED_SUCCESSFULLY:
    "Tenant configuration retrieved successfully",
  CONFIGURATION_ALREADY_EXISTS_FOR_CONTEXT:
    "Configuration already exists for context:",
  BULK_IMPORT_SUCCESS: "Users imported successfully",
  BULK_IMPORT_FAILURE: "Failed to import users",

  // Pathway Management Messages

  PATHWAY_CREATED_SUCCESSFULLY: "Pathway created successfully",
  PATHWAY_UPDATED_SUCCESSFULLY: "Pathway updated successfully",
  PATHWAY_NOT_FOUND: "Pathway not found",
  PATHWAY_KEY_EXISTS: "Pathway with this name already exists",
  PATHWAY_LIST_SUCCESS: "Pathways retrieved successfully",
  PATHWAY_GET_SUCCESS: "Pathway retrieved successfully",
  INVALID_TAG_IDS: "Invalid tag IDs provided",

  // Tag Management Messages
  TAG_CREATED_SUCCESSFULLY: "Tag created successfully",
  TAG_UPDATED_SUCCESSFULLY: "Tag updated successfully",
  TAG_ARCHIVED_SUCCESSFULLY: "Tag archived successfully",
  TAG_NOT_FOUND: "Tag not found",
  TAG_NAME_EXISTS: "Tag with this name already exists",
  TAG_LIST_SUCCESS: "Tags retrieved successfully",
  TAG_GET_SUCCESS: "Tag retrieved successfully",

  // Interest Management Messages
  INTEREST_CREATED_SUCCESSFULLY: "Interest created successfully",
  INTEREST_UPDATED_SUCCESSFULLY: "Interest updated successfully",
  INTEREST_DELETED_SUCCESSFULLY: "Interest deleted successfully",
  INTEREST_NOT_FOUND: "Interest not found",
  INTEREST_KEY_EXISTS: "Interest with this key already exists for the pathway",
  INTEREST_LIST_SUCCESS: "Interests retrieved successfully",
  USER_INTERESTS_SAVED_SUCCESSFULLY: "User interests saved successfully",
  PATHWAY_SWITCHED_SUCCESSFULLY: "Pathway switched successfully",
  PATHWAY_ASSIGNED_SUCCESSFULLY: "Pathway assigned successfully",
  PATHWAY_ASSIGN_REQUIRES_COMPLETED_ALUMNI:
    "User must have completed_alumni tag to assign pathway.",
  PATHWAY_ASSIGN_LMS_ENROLLMENT_FAILED:
    "LMS enrollment failed. Pathway assignment aborted.",
};
