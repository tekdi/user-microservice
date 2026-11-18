# SSO Module

## Module Overview

The SSO (Single Sign-On) module handles authentication through external SSO providers (e.g., Newton). It authenticates users via SSO, creates users in the database if they don't exist, and returns JWT tokens for session management.

**Purpose**: Provide SSO authentication integration with external providers, automatic user creation, and token management.

**Key Entities**: None (uses User entity from UserModule)

**Dependencies**:
- `UserModule` / `UserService` - User creation, tenant/role assignment, Kafka events
- `RoleService` - Role name lookup
- `FieldsModule` / `FieldsService` - Custom field updates
- `UserTenantMappingModule`
- `CacheService` - Invalidation after field/user writes (see [cache.md](./cache.md))
- `KafkaModule` (via `UserService.publishUserEvent`, see [kafka.md](./kafka.md))
- External SSO provider: the Newton login endpoint, `<KEYCLOAK>/realms/pratham/newton-login` (Keycloak SPI), called with `application/x-www-form-urlencoded`

**Configuration**: `KEYCLOAK` (base URL), `NEWTON_API_TIMEOUT` (ms, default 30000). Defaults in `src/constants/sso.constants.ts`: `DEFAULT_TENANT_ID`, `DEFAULT_LEARNER_ROLE_ID`, `MANAGER_ROLE_ID`.

## API Endpoints

### SSO Authenticate - POST `/authenticate`

**API ID**: `api.sso.authenticate` is used for error responses. Success responses are built by the service and carry `"id": "api.login"`.

**Route**: `POST /user/v1/sso/authenticate`

**Authentication**: Not required. Not throttled (the login throttle applies only to `/auth/login`, see [auth.md](./auth.md#login-throttling)).

**Request Body** (`SsoRequestDto`):
```typescript
{
  accessToken: string;  // required - access token from the SSO provider
  userId: string;       // required - user ID at the SSO provider
  ssoProvider: string;  // required - e.g. "newton"
  tenantId?: string;    // optional UUID - defaults to SSO_DEFAULTS.DEFAULT_TENANT_ID
  roleId?: string;      // optional UUID - defaults to SSO_DEFAULTS.DEFAULT_LEARNER_ROLE_ID
  roles?: string;       // internal, populated from roleId
}
```

**Response**:
- **Success (200)**: Authentication successful with the tokens issued by the Newton/Keycloak SPI
  ```json
  {
    "id": "api.login",
    "ver": "1.0",
    "params": {
      "status": "successful",
      "successmessage": "Auth Token fetched Successfully."
    },
    "responseCode": 200,
    "result": {
      "access_token": "jwt_token",
      "refresh_token": "refresh_token",
      "expires_in": 86400,
      "refresh_expires_in": 604800,
      "token_type": "Bearer"
    }
  }
  ```
  `expires_in` and `refresh_expires_in` are hard-coded (24 h / 7 d) in `createStandardResponse`, not read from the token.
- **Error (400)**: Invalid `tenantId` UUID; Newton returned HTTP error; no userId in provider response
- **Error (401)**: Newton `success: false`, message `Email address is not registered in ERP for this user. Please contact your administrator.`
- **Error (404)**: `roleId` does not exist (`Role name not found. Please enter a valid Role ID`)
- **Error (503)**: No response from Newton (network error)
- **Error (500)**: Other failures

**Business Logic**:
1. Apply defaults: missing `tenantId` becomes the default tenant, missing `roleId` becomes the default learner role
2. Resolve the role name from `Roles` by `roleId` (404 if absent) and store it in `dto.roles`
3. POST `userId`, `access_token`, `roles` to the Newton login endpoint
4. If Newton reports `success: false` -> 401
5. If `isNewUser` is false (existing user): build the response immediately, then run `handleExistingUser` in the background (fire-and-forget):
   - upsert custom fields from `newtonData` (label -> field ID per tenant); invalidates `user:{id}`, `ufields:{id}`, `userfilter`
   - if `newtonData.IS_MANAGER` is `YES` and the user lacks the manager role in the tenant, assign it
   - publish `USER_UPDATED`
6. If new user: `handleNewUser` runs before the response:
   - `createUserInDatabase` (username and email from Newton email, no password, tenant + role mapping from the request)
   - upsert custom fields from `newtonData`, invalidate `ufields:{id}`, `userfilter`
   - if `IS_MANAGER` is `YES`, assign the manager role in the tenant
   - publish `USER_CREATED`
7. Return the standard response with the tokens Newton supplied

**Edge Cases**:
- Existing-user path: failures in the background update are logged and never change the 200 response
- Custom field label not found for the tenant -> skipped with a warning
- Custom field update failure -> logged, flow continues
- User creation failure -> 500 `Failed to create user in database`
- Newton HTTP error responses are wrapped into the 400 message, including the upstream body

**Dependencies**:
- `SsoService.authenticate()`
- Newton API
- `UserService` (`createUserInDatabase`, `assignUserToTenantAndRoll`, `checkIfUserHasRoleInTenant`, `publishUserEvent`)
- `FieldsService` (`getFieldIdByLabel`, `updateUserCustomFields`, `updateCustomFields`)
- `CacheService.invalidate`

**Side Effects**:
- Creates user, tenant/role mapping in database (if new)
- Upserts custom fields from `newtonData`
- May assign manager role
- Cache namespace bumps: `ufields:{userId}`, `userfilter` (and `user:{userId}` for existing users)
- Kafka: `USER_CREATED` (new) or `USER_UPDATED` (existing)

**Example**: Newton user `E1001` posts `{accessToken, userId: "E1001", ssoProvider: "newton"}` with no tenant/role. The service uses the default tenant and learner role, Newton answers `isNewUser: true` with `newtonData.IS_MANAGER = "YES"`. The user row and learner mapping are created, the manager role is added, and the caller gets the Newton-issued tokens.

## Common Issues & Solutions

### Issue: SSO authentication fails
**Solution**: Verify SSO token is valid and not expired. Check SSO provider configuration and network connectivity.

### Issue: User not created after SSO authentication
**Solution**: Check user creation logic, required fields, and database constraints. Verify SSO data contains all required user information.

### Issue: Custom fields not updating from SSO
**Solution**: Ensure field labels in SSO data match field labels in database. Check field creation and tenant context.

### Common Mistakes to Avoid
1. Not handling SSO provider failures gracefully
2. Missing error handling for user creation
3. Not validating SSO token before processing
4. Ignoring custom field update failures (should log but not fail auth)
