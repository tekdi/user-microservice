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
