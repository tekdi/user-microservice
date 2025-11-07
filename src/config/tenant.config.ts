export interface TenantConfig {
  tenantId: string;
  name: string;
}

export const ALLOWED_TENANTS: TenantConfig[] = [
  {
    tenantId: 'e39447df-069d-4ccf-b92c-576f70b350f3',
    name: 'Pratham'
  }
];

/**
 * Check if a tenant ID is allowed
 * @param tenantId - Tenant ID to validate
 * @returns boolean indicating if tenant is allowed
 */
export function isAllowedTenant(tenantId: string): boolean {
  return ALLOWED_TENANTS.some(tenant => tenant.tenantId === tenantId);
}

/**
 * Get tenant configuration by ID
 * @param tenantId - Tenant ID to lookup
 * @returns TenantConfig or undefined if not found
 */
export function getTenantConfig(tenantId: string): TenantConfig | undefined {
  return ALLOWED_TENANTS.find(tenant => tenant.tenantId === tenantId);
}

