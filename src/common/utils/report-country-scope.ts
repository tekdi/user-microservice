/**
 * Aspire Leaders-specific: the country rule shared by every report that scopes
 * on the user's LIVE profile country (Users.currentCountry) rather than on a
 * cohort application's frozen country.
 *
 * Two layers, always applied in this order:
 *
 *  1. the caller's OWN scope - a Regional Admin is restricted to the countries
 *     assigned to them, resolved server-side from their profile and NEVER
 *     accepted from the caller. Every other admin role (Admin, ALP Program
 *     Admin, ...) is unrestricted, matching reportFilterCohortMembers().
 *  2. the admin's explicit Country dropdown, which can only ever SUBTRACT from
 *     (1) - asking for a country outside your assignment yields nothing, not
 *     more rows.
 *
 * Lives here rather than in one feature service because the cohort-less
 * reports (pathway users, pathway assessments) need exactly the same decision
 * and a second copy of it would be a second place for the rule to drift.
 */
import { DataSource } from 'typeorm';

/**
 * Returns EVERY role CODE the user holds, lowercased.
 *
 * Returning only the first (`ORDER BY ... LIMIT 1`) would make a multi-role
 * user's scoping depend on which grant happened to sort first - and that fails
 * OPEN: a Regional Admin whose first role was something else would be treated
 * as unrestricted.
 */
export async function getRoleCodes(
  dataSource: DataSource,
  userId: string,
): Promise<Set<string>> {
  const rows: { roleCode?: string }[] = await dataSource.query(
    `SELECT DISTINCT R.code AS "roleCode"
     FROM public."UserTenantMapping" UTM
     INNER JOIN public."UserRolesMapping" URM ON URM."userId" = UTM."userId" AND URM."tenantId" = UTM."tenantId"
     INNER JOIN public."Roles" R ON R."roleId" = URM."roleId"
     WHERE UTM."userId" = $1`,
    [userId],
  );

  const codes = new Set<string>();
  for (const row of rows ?? []) {
    if (row.roleCode) codes.add(row.roleCode.trim().toLowerCase());
  }
  return codes;
}

/**
 * Resolves a Regional Admin's own allowed countries as country NAMES, from the
 * ONE profile-level custom field with Fields.name = 'country' AND
 * Fields.context IS NULL.
 *
 * That `context IS NULL` matters: the several COHORTMEMBER-scoped "country of
 * origin"/"country of residence" fields hold a cohort APPLICANT's country, not
 * the admin's own.
 *
 * Names rather than countries.id because these reports scope on
 * Users.currentCountry, a free-text column with no FK to `countries`.
 *
 * The stored value joins the selected countries.name values with commas, so a
 * plain split(',') is unsafe - several real country names contain an internal
 * comma ("Bolivia, Plurinational State of", "Korea, Democratic People's
 * Republic of"). Matching by substring containment against the real country
 * list, longest name first and removing each match as it is found, keeps a
 * comma-containing name whole before its comma-free prefix can match on its
 * own. Same approach as resolveRegionalAdminCountryIds() in
 * cohortMembers-adapter.ts.
 */
export async function getRegionalAdminCountryNames(
  dataSource: DataSource,
  adminUserId: string,
): Promise<string[]> {
  const [fieldValueRow] = await dataSource.query(
    `SELECT fv."dropdownValue", fv.value
     FROM "FieldValues" fv
     JOIN "Fields" f ON f."fieldId" = fv."fieldId"
     WHERE fv."itemId" = $1
       AND f.name = 'country'
       AND f.context IS NULL
     LIMIT 1`,
    [adminUserId],
  );

  const rawValue = fieldValueRow?.dropdownValue || fieldValueRow?.value;
  if (!rawValue) {
    return [];
  }

  const allCountries: { name: string }[] = await dataSource.query(
    `SELECT name FROM countries ORDER BY LENGTH(name) DESC`,
  );

  let remaining = String(rawValue);
  const matchedNames: string[] = [];
  for (const country of allCountries) {
    const idx = remaining.toLowerCase().indexOf(country.name.toLowerCase());
    if (idx !== -1) {
      matchedNames.push(country.name);
      remaining =
        remaining.slice(0, idx) + remaining.slice(idx + country.name.length);
    }
  }
  return matchedNames;
}

/**
 * The resolved country narrowing for one report request.
 *
 * `blocked` means "this caller can see nothing at all" - a Regional Admin with
 * no resolvable country, or one who asked only for countries outside their
 * assignment. Callers MUST return an empty result for it rather than falling
 * through to an unfiltered query.
 *
 * `countries` is a list of lowercased/trimmed names for a case-insensitive
 * match against Users.currentCountry, or null for "no narrowing at all"
 * (an unscoped admin who selected no country).
 */
export interface ReportCountryScope {
  blocked: boolean;
  countries: string[] | null;
}

const normalizeNames = (names: string[]): string[] =>
  Array.from(
    new Set(
      names
        .map((name) => String(name ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );

/**
 * Combines the caller's own scope with their requested countries - see this
 * file's header for the rule.
 *
 * Fails closed on an unidentified caller: without a resolvable adminUserId
 * there is no scope to apply, and serving every country would be the unsafe
 * direction to be wrong in. Unreachable through a guarded route.
 */
export async function getReportCountryScope(
  dataSource: DataSource,
  adminUserId: string | undefined,
  requestedCountries: string[] | undefined,
): Promise<ReportCountryScope> {
  const requested = normalizeNames(requestedCountries ?? []);

  if (!adminUserId) {
    return { blocked: true, countries: null };
  }

  const roleCodes = await getRoleCodes(dataSource, adminUserId);

  // Admin wins when a user holds both: roles are additive grants, so being
  // given Admin should not be silently narrowed by also holding Regional
  // Admin. Same precedence as reportFilterCohortMembers().
  const isRegionalAdmin =
    roleCodes.has('regional_admin') && !roleCodes.has('admin');

  if (!isRegionalAdmin) {
    // Unscoped admin: the dropdown is the only narrowing, and omitting it
    // legitimately means "all countries".
    return { blocked: false, countries: requested.length ? requested : null };
  }

  const allowed = normalizeNames(
    await getRegionalAdminCountryNames(dataSource, adminUserId),
  );
  if (allowed.length === 0) {
    return { blocked: true, countries: null };
  }

  if (requested.length === 0) {
    return { blocked: false, countries: allowed };
  }

  const allowedSet = new Set(allowed);
  const intersection = requested.filter((name) => allowedSet.has(name));
  return intersection.length === 0
    ? { blocked: true, countries: null }
    : { blocked: false, countries: intersection };
}
