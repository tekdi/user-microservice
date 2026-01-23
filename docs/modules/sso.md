# SSO Module

## Module Overview

The SSO (Single Sign-On) module handles authentication through external SSO providers (e.g., Newton). It authenticates users via SSO, creates users in the database if they don't exist, and returns JWT tokens for session management.

**Purpose**: Provide SSO authentication integration with external providers, automatic user creation, and token management.

**Key Entities**: None (uses User entity from UserModule)

**Dependencies**:
- `UserModule` - For user creation and management
- `FieldsModule` - For custom field updates
- External SSO provider (Newton API)

## API Endpoints

### SSO Authenticate - POST `/authenticate`

**API ID**: `api.sso.authenticate`

**Route**: `POST /user/v1/sso/authenticate`

**Authentication**: Not required

**Request Body** (`SsoRequestDto`):
```typescript
{
  token: string; // SSO token from external provider
  // Additional SSO-specific fields
}
```

**Response**:
- **Success (200)**: Authentication successful with JWT tokens
  ```json
  {
    "id": "api.sso.authenticate",
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
- **Error (401)**: Unauthorized - SSO authentication failed
- **Error (400)**: Bad Request - Invalid input data
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validates SSO token with external provider (Newton API)
2. Retrieves user information from SSO provider
3. Checks if user exists in database:
   - If exists: Updates user information if needed
   - If not exists: Creates new user with SSO data
4. Updates custom fields from SSO data (newtonData)
5. Generates JWT tokens (access and refresh)
6. Returns tokens in standard format

**Edge Cases**:
- Invalid SSO token → 401 Unauthorized
- SSO provider unavailable → 500 Internal Server Error
- User creation fails → 500 Internal Server Error
- Custom field update fails → Logged but doesn't fail authentication

**Dependencies**:
- `SsoService.authenticate()`
- External SSO provider API (Newton)
- `UserService` (for user creation/update)
- `FieldsService` (for custom field updates)

**Side Effects**:
- Creates user in database (if new)
- Updates user information (if exists)
- Updates custom fields from SSO data
- Generates JWT tokens

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
