/**
 * API ID Configuration
 *
 * This file defines unique identifiers for all API endpoints in the application.
 * These IDs are used for:
 * - Logging and tracing API calls
 * - Error handling and response formatting
 * - API documentation and monitoring
 * - Performance tracking and analytics
 *
 * Naming Convention:
 * - Format: 'api.{module}.{action}'
 * - Examples: 'api.user.create', 'api.cohortmember.search'
 * - All IDs are lowercase with dots as separators
 *
 * Usage:
 * - Import this constant in controllers and services
 * - Pass the appropriate ID to APIResponse methods
 * - Use for structured logging and error tracking
 */
export const APIID = {
  // User Management APIs
  USER_GET: 'api.user.get',
  USER_CREATE: 'api.user.create',
  USER_UPDATE: 'api.user.update',
  USER_LIST: 'api.user.list',
  USER_RESET_PASSWORD: 'api.user.resetPassword',
  USER_RESET_PASSWORD_LINK: 'api.user.sendLinkForResetPassword',
  USER_FORGOT_PASSWORD: 'api.user.forgotPassword',
  USER_DELETE: 'api.user.delete',
  USER_BULK_IMPORT: 'api.user.bulkImport',

  // Role Management APIs
  ROLE_GET: 'api.role.get',
  ROLE_CREATE: 'api.role.create',
  ROLE_UPDATE: 'api.role.update',
  ROLE_SEARCH: 'api.role.search',
  ROLE_DELETE: 'api.role.delete',

  // Privilege Management APIs
  PRIVILEGE_BYROLEID: 'api.privilegebyRoleId.get',
  PRIVILEGE_BYPRIVILEGEID: 'api.privilegebyPrivilegeId.get',
  PRIVILEGE_CREATE: 'api.privilege.create',
  PRIVILEGE_DELETE: 'api.privilege.delete',

  // User Role Mapping APIs
  USERROLE_CREATE: 'api.userRole.create',
  USERROLE_GET: 'api.userRole.get',
  USERROLE_DELETE: 'api.userRole.delete',

  // Cohort Member Management APIs
  COHORT_MEMBER_GET: 'api.cohortmember.get',
  COHORT_MEMBER_CREATE: 'api.cohortmember.create',
  COHORT_MEMBER_UPDATE: 'api.cohortmember.update',
  COHORT_MEMBER_SEARCH: 'api.cohortmember.list',
  COHORT_MEMBER_DELETE: 'api.cohortmember.delete',
  COHORT_MEMBER_EVALUATE_SHORTLISTING: 'api.cohortmember.evaluateShortlisting',

  // Privilege Assignment APIs
  ASSIGNPRIVILEGE_CREATE: 'api.assignprivilege.create',
  ASSIGNPRIVILEGE_GET: 'api.assignprivilege.get',

  // Cohort Management APIs
  COHORT_CREATE: 'api.cohort.create',
  COHORT_LIST: 'api.cohort.list',
  COHORT_READ: 'api.cohort.read',
  COHORT_UPDATE: 'api.cohort.update',
  COHORT_DELETE: 'api.cohort.delete',

  // Tenant Assignment APIs
  ASSIGN_TENANT_CREATE: 'api.assigntenant.create',

  // Fields Management APIs
  FIELDS_CREATE: 'api.fields.create',
  FIELDS_SEARCH: 'api.fields.search',
  FIELDVALUES_CREATE: 'api.fieldValues.create',
  FIELDVALUES_SEARCH: 'api.fieldValues.search',
  FIELDVALUES_DELETE: 'api.fieldValues.delete',
  FIELD_OPTIONS_DELETE: 'api.fields.options.delete',
  FIELD_DELETE: 'api.fields.delete',

  // Authentication APIs
  LOGIN: 'api.login',
  LOGOUT: 'api.logout',
  REFRESH: 'api.refresh',
  USER_AUTH: 'api.user.auth',
  RBAC_TOKEN: 'api.rbac.token',

  // Academic Year Management APIs
  ACADEMICYEAR_CREATE: 'api.academicyear.create',
  ACADEMICYEAR_LIST: 'api.academicyear.list',
  ACADEMICYEAR_GET: 'api.academicyear.get',

  // Form Management APIs
  FORM_GET: 'api.form.read',
  FORM_CREATE: 'api.form.create',
  FORM_UPDATE: 'api.form.update',

  // Cohort Academic Year Mapping APIs
  ADD_COHORT_TO_ACADEMIC_YEAR: 'api.create.cohortAcademicYear',

  // Tenant Management APIs
  TENANT_CREATE: 'api.tenant.create',
  TENANT_UPDATE: 'api.tenant.update',
  TENANT_DELETE: 'api.tenant.delete',
  TENANT_SEARCH: 'api.tenant.search',
  TENANT_LIST: 'api.tenant.list',

  // OTP and Verification APIs
  SEND_OTP: 'api.send.OTP',
  VERIFY_OTP: 'api.verify.OTP',
  SEND_RESET_OTP: 'api.send.reset.otp',

  // Form Submission APIs
  FORM_SUBMISSION_CREATE: 'api.formSubmission.create',
  FORM_SUBMISSION_UPDATE: 'api.formSubmission.update',
  FORM_SUBMISSION_DELETE: 'api.formSubmission.delete',
  FORM_SUBMISSION_GET: 'api.formSubmission.get',
  FORM_SUBMISSION_LIST: 'api.formSubmission.list',
} as const;
