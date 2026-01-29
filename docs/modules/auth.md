# Auth Module

## Module Overview

The Auth module handles user authentication operations including login, logout, token refresh, and user authentication verification. It integrates with Keycloak for authentication.

**Purpose**: Manage user authentication, JWT token operations, and session management.

**Key Entities**: None (stateless authentication)

**Dependencies**:
- Keycloak - For authentication
- `JwtUtil` - For JWT operations
- `UserModule` - For user data retrieval

## API Endpoints

### Login - POST `/login`

**API ID**: `api.login`

**Route**: `POST /user/v1/auth/login`

**Authentication**: Not required

**Request Body** (`AuthDto`):
- `username` (string) - Username
- `password` (string) - Password

**Response**:
- **Success (200)**: Access token and refresh token
  ```json
  {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 3600
  }
  ```
- **Error (401)**: Invalid credentials
- **Error (403)**: Forbidden

**Business Logic**:
1. Validates credentials with Keycloak
2. Generates JWT tokens (access and refresh)
3. Returns tokens to client

**Edge Cases**:
- Invalid credentials → 401 Unauthorized
- User account disabled → 403 Forbidden
- Keycloak service unavailable → 500 Internal Server Error

**Dependencies**:
- `AuthService.login()`
- Keycloak API

**Side Effects**: None (stateless)

---

### Get User by Auth - GET `/`

**API ID**: `api.user.auth`

**Route**: `GET /user/v1/auth/`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `Authorization` (required) - JWT token
- `tenantid` (optional) - Tenant ID

**Response**:
- **Success (200)**: Authenticated user details
- **Error (401)**: Unauthorized
- **Error (403)**: Forbidden

**Business Logic**:
1. Validates JWT token
2. Extracts user information from token
3. Retrieves user details from database
4. Optionally filters by tenantId
5. Returns user data

**Edge Cases**:
- Invalid or expired token → 401 Unauthorized
- User not found → 404 Not Found
- User account disabled → 403 Forbidden

**Dependencies**:
- `AuthService.getUserByAuth()`
- `UserService` (for user data)

**Side Effects**: None

---

### Refresh Token - POST `/refresh`

**API ID**: `api.refresh`

**Route**: `POST /user/v1/auth/refresh`

**Authentication**: Not required

**Request Body** (`RefreshTokenRequestBody`):
- `refresh_token` (string) - Refresh token

**Response**:
- **Success (200)**: New access token and refresh token
- **Error (401)**: Invalid or expired refresh token

**Business Logic**:
1. Validates refresh token
2. Generates new access token
3. Optionally generates new refresh token
4. Returns new tokens

**Edge Cases**:
- Invalid refresh token → 401 Unauthorized
- Expired refresh token → 401 Unauthorized

**Dependencies**:
- `AuthService.refreshToken()`
- Keycloak API

**Side Effects**: None

---

### Logout - POST `/logout`

**API ID**: `api.logout`

**Route**: `POST /user/v1/auth/logout`

**Authentication**: Not required

**Request Body** (`LogoutRequestBody`):
- `refresh_token` (string) - Refresh token to invalidate

**Response**:
- **Success (200)**: Logout successful

**Business Logic**:
1. Invalidates refresh token in Keycloak
2. Optionally invalidates access token
3. Returns success response

**Edge Cases**:
- Invalid refresh token → May still return success (idempotent)
- Keycloak service unavailable → 500 Internal Server Error

**Dependencies**:
- `AuthService.logout()`
- Keycloak API

**Side Effects**: Invalidates tokens in Keycloak

## Common Issues & Solutions

### Issue: Login fails with valid credentials
**Solution**: Check Keycloak configuration, user account status, and network connectivity to Keycloak.

### Issue: Token refresh fails
**Solution**: Verify refresh token is valid and not expired. Check Keycloak token settings.

### Issue: User not found after authentication
**Solution**: Ensure user exists in database and matches Keycloak user. Check user synchronization.

### Common Mistakes to Avoid
1. Not handling token expiration gracefully
2. Storing sensitive data in JWT tokens
3. Not validating token signature
4. Missing error handling for Keycloak failures
