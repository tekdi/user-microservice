/**
 * SSO Constants
 * Default values for SSO authentication
 */

export const SSO_DEFAULTS = {
  /**
   * Default Tenant ID for SSO users
   * This tenant ID will be used when not provided in the request
   */
  DEFAULT_TENANT_ID: "914ca990-9b45-4385-a06b-05054f35d0b9",

  /**
   * Default Learner Role ID for SSO users
   * This role ID will be used when not provided in the request
   */
  DEFAULT_LEARNER_ROLE_ID: "eea7ddab-bdf9-4db1-a1bb-43ef503d65ef",
  MANAGER_ROLE_ID: "c4454929-954e-4c51-bb7d-cca834ab9375",
} as const;

/**
 * Type for SSO defaults (useful for type safety)
 */
export type SsoDefaults = typeof SSO_DEFAULTS;
