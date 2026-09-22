/**
 * Role codes that the platform itself has to reason about.
 *
 * Roles are ordinarily opaque to the code - they are rows in `Roles` and are
 * referenced by roleId. These few are the exception: behaviour genuinely
 * differs by role, so the code has to be able to recognise them. They are
 * matched on `Roles.code` rather than a roleId so that recreating the role, or
 * having one row per tenant, does not break the check.
 */

/**
 * Observers watch a cohort rather than apply to it. They are placed straight
 * into their cohorts at `shortlisted` instead of walking the application
 * funnel, and they get no application form submission on bulk import.
 */
export const OBSERVER_ROLE_CODE = (
  process.env.OBSERVER_ROLE_CODE ?? 'observer'
).toLowerCase();

/**
 * Auto tags stamped on an observer's Users row at creation time.
 *
 * `completed_alumni` is what gates pathway assignment
 * (PathwaysService.assignPathwayToUser refuses a user without it), so an
 * observer needs it to be assignable to a pathway at all.
 *
 * It also forces a "rejected" result in shortlisting evaluation
 * (evaluateMemberRules), but that only ever runs over members in `submitted`
 * status, and observers are placed straight into `shortlisted` - so the two
 * do not meet. Worth re-checking if observers ever gain a `submitted` state.
 */
export const OBSERVER_AUTO_TAGS: string[] = (
  process.env.OBSERVER_AUTO_TAGS ?? 'completed_alumni'
)
  .split(',')
  .map((tag) => tag.trim())
  .filter((tag) => tag.length > 0);

/**
 * Students are the only role the user list screens and their CSV exports are
 * meant to show, so `POST user/v1/list` falls back to this code when a request
 * carries no `filters.role` of its own. Matched on `Roles.code`, like the other
 * constants here, so a per-tenant or renamed "Student" row still resolves.
 */
export const STUDENT_ROLE_CODE = (
  process.env.STUDENT_ROLE_CODE ?? 'student'
).toLowerCase();
