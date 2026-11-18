# Auth RBAC Module

## Module Overview

The Auth RBAC module issues the RBAC token. After a user has authenticated with Keycloak, the client exchanges that access token (plus a tenant ID) for a second, short-lived JWT that embeds the user's profile, roles and privileges for that tenant. The RBAC token is signed with an application secret, not by Keycloak, and is presented to guarded endpoints in the `rbac_token` header.

**Purpose**: Provide role/privilege claims for a user within one tenant.

**Key Entities**: None owned. Reads `Roles`, `UserRolesMapping`, `RolePrivilegeMapping` (via `RoleService`) and `User` (via `UserService`).

**Dependencies**:
- `UserModule` / `UserService.findUserDetails()` - user profile
- `RoleModule` / `RoleService.findUserRoleData()`, `findPrivilegeByRoleId()` - roles and privileges
- `JwtModule` (`@nestjs/jwt`, registered globally here) - signing
- `JwtAuthGuard` (Keycloak) - caller authentication

**Configuration**: `RBAC_JWT_SECRET`, `RBAC_JWT_EXPIRES_IN` (module default `1h`), `ISSUER`, `AUDIENCE`.

## API Endpoints

### RBAC Token - GET `/token`

**API ID**: `api.rbac.token`

**Route**: `GET /user/v1/auth/rbac/token`

**Authentication**: Required (`JwtAuthGuard`, Keycloak Bearer token)

**Headers**:
- `Authorization: Bearer <keycloak access token>` (required)
- `tenantid` (required) - must be a valid UUID

**Response**:
- **Success (200)**:
  ```json
  {
    "id": "api.rbac.token",
    "params": { "status": "successful" },
    "responseCode": 200,
    "result": { "access_token": "<rbac jwt>" }
  }
  ```
- **Error (400)**: `Please add valid Tenant ID` (header missing or not a UUID), `User details or tenant not found for user`, or `Roles not found for user`
- **Error (401)**: Missing/invalid Keycloak token

**Business Logic**:
1. Guard validates the Keycloak token; `req.user.username` is taken from `preferred_username`
2. Controller rejects a non-UUID `tenantid` with `BadRequestException`
3. `findUserDetails(null, username)` loads the user
4. `findUserRoleData(userId, tenantId)` loads the user's roles in that tenant; empty list is a 400
5. Privilege codes are loaded for all those role IDs
6. Token payload: `{ userData: { ...user, roles: [codes], privileges: [codes], tenantId }, iss: ISSUER, aud: AUDIENCE }`, signed with `RBAC_JWT_SECRET`
7. Returns `{ access_token }`

**Edge Cases**:
- User has no role in the requested tenant → 400, no token
- `tenantid` belongs to a tenant the user is not mapped to → no roles, 400
- Role has no privileges → token is issued with `privileges: []`

**Dependencies**:
- `AuthRbacService.signInRbac()`, `getPrivileges()`, `generateToken()`
- `RoleService`, `UserService`

**Side Effects**: None (no DB writes, no cache, no Kafka).

**How the token is consumed**: `RbacAuthGuard` (strategy `jwt-rbac`, header `rbac_token`) verifies the signature and expiry. A user whose `roles` include `admin` passes every permission check; otherwise `iss`/`aud` must match config, the user must have at least one privilege, and every permission named in `@Permissions(...)` must be in `userData.privileges`. See [common.md](./common.md#guards).

**Example**: user `asha` is a `teacher` in tenant `T1`, and `teacher` holds privileges `cohort.read` and `users.read`. `GET /user/v1/auth/rbac/token` with `tenantid: T1` returns a JWT whose `userData.roles = ["teacher"]` and `userData.privileges = ["cohort.read","users.read"]`. A handler decorated `@Permissions("cohort.create")` rejects it with 401.

## Common Issues & Solutions

### Issue: RBAC token missing permissions
**Solution**: Verify user has roles assigned in the requested tenant and roles have privileges mapped (`RolePrivilegeMapping`). Decode the token and inspect `userData.privileges`.

### Issue: 400 "Roles not found for user"
**Solution**: The user has no `UserRolesMapping` row for that `tenantid`. Check tenant mapping and role assignment.

### Common Mistakes to Avoid
1. Sending the Keycloak token in `rbac_token` or the RBAC token in `Authorization`
2. Reusing one RBAC token across tenants (it is bound to the `tenantid` it was issued for)
3. Missing role-privilege mappings
