export const API_RESPONSES = {
  GIVEN_FILTER_USER_NOT_FOUND: "User does not exist for given filters",
  USERNAME_NOT_FOUND: "Username does not exist",
  EMAIL_EXIST: "Email already exists",
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
  INVALID_OPTION: 'Invalid Option Selected',

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
  USER_HIERARCHY_VIEW_SUCCESS: "User hierarchy view fetched successfully.",
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
  USERNAME_EXISTS_KEYCLOAK: 'Username is already exists in keycloak',
  UPDATE_USER_KEYCLOAK_ERROR:'Failed to update username details in Keycloak.',
  USERNAME_SUGGEST_SUCCESSFULLY:'Username is already taken. Suggested a new unique username.',

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
  SIGNED_URL_SUCCESS: "Signed URL generated successfully",
  SIGNED_URL_FAILED: "Error while generating signed URL",
  INVALID_FILE_TYPE: "Invalid file type. Allowed file types are: '.jpg','.jpeg','.png','.webp','.pdf','.doc','.docx','.mp4','.mov','.txt','.csv','.mp3'",
  FILE_SIZE_ERROR: "File too large. Maximum allowed file size is 10MB.",

  //User Tenant Mapping
  TENANT_ASSIGNED_SUCCESSFULLY: "Tenant assigned successfully to the user.",
  USER_ADDED_TO_TENANT_WITH_ROLE: "User is successfully added to the Tenant with role.",
  USER_ADDED_TO_TENANT_WITH_ROLE_SUCCESS: "User added to tenant with role successfully.",
  USER_TENANT_MAPPING_STATUS_UPDATED: "User-Tenant mapping status updated successfully.",
  USER_TENANT_MAPPINGS_RETRIEVED: "User tenant mappings retrieved successfully",
  USER_ALREADY_HAS_ROLE_IN_TENANT: (roleId, tenantId) =>
    `User already has role ${roleId} in Tenant ${tenantId}. Each user can have different roles in the same tenant, but not the same role multiple times.`,
  USER_DOES_NOT_EXIST: (userId) => `User ${userId} does not exist.`,
  TENANT_DOES_NOT_EXIST: (tenantId) => `Tenant ${tenantId} does not exist.`,
  ROLE_DOES_NOT_EXIST: (roleId) => `Role ${roleId} does not exist.`,
  USER_TENANT_MAPPING_NOT_FOUND: (userId, tenantId) =>
    `User-Tenant mapping not found for userId: ${userId} and tenantId: ${tenantId}`,
  NO_TENANT_MAPPINGS_FOUND: "No tenant mappings found for this user",
  CONFLICT_USER_ROLE_IN_TENANT: "User already has this role in the tenant. Users can have multiple roles in the same tenant, but not the same role multiple times.",
  
  //User Tenant Mapping Logger Messages
  LOG_USER_ASSIGNED_ROLE_IN_TENANT: (userId, roleId, tenantId) =>
    `User ${userId} assigned role ${roleId} in tenant ${tenantId}`,
  LOG_PROCESSING_CUSTOM_FIELDS: (count, userId, tenantId) =>
    `Processing ${count} custom fields for user ${userId} in tenant ${tenantId}`,
  LOG_STATUS_UPDATED_FOR_USER_TENANT: (userId, tenantId) =>
    `Successfully updated status for user ${userId} in tenant ${tenantId}`,
  LOG_USER_TENANT_EVENT_PUBLISHED: (eventType, userId, tenantId) =>
    `User-tenant ${eventType} event published to Kafka for user ${userId} and tenant ${tenantId}`,
  ERROR_FAILED_PUBLISH_USER_TENANT_CREATED: (userId) =>
    `Failed to publish user-tenant created event to Kafka for user ${userId}`,
  ERROR_FAILED_PUBLISH_USER_TENANT_UPDATED: (userId) =>
    `Failed to publish user-tenant updated event to Kafka for user ${userId}`,
  ERROR_IN_USER_TENANT_MAPPING: (userId) =>
    `Error in userTenantMapping for user ${userId}`,
  ERROR_IN_UPDATE_TENANT_STATUS: (userId, tenantId) =>
    `Error in updateAssignTenantStatus for user ${userId} and tenant ${tenantId}`,
  ERROR_FAILED_FETCH_MAPPING_DATA: "Failed to fetch user-tenant mapping data for Kafka event",
  ERROR_FAILED_FETCH_USER_TENANT_DATA: "Failed to fetch user-tenant data for Kafka event",
  ERROR_FAILED_FETCH_CUSTOM_FIELDS: "Failed to fetch custom fields for Kafka event",
  ERROR_FAILED_PUBLISH_USER_TENANT_EVENT: (eventType) =>
    `Failed to publish user-tenant ${eventType} event to Kafka`,
  ERROR_GET_USER_TENANT_MAPPINGS: "Error retrieving user tenant mappings"
};

