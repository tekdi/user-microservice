# User Module

## Module Overview

The User module is the core module of the microservice, responsible for managing user accounts, profiles, authentication-related operations, and user lifecycle management. It handles user creation, updates, deletion, search, password management, OTP operations, and hierarchical user views.

**Purpose**: Centralized user management with support for multi-tenancy, custom fields, cohort assignments, role mappings, and authentication integration.

**Key Entities**:
- `User` - Core user entity with profile information
- `UserTenantMapping` - Maps users to tenants with status
- `UserRoleMapping` - Maps users to roles
- `CohortMembers` - Maps users to cohorts
- `FieldValues` - Custom field values for users

**Dependencies**:
- `FieldsModule` - For custom field management
- `RoleModule` - For role management
- `AcademicyearsModule` - For academic year context
- `CohortAcademicYearModule` - For cohort-academic year mappings
- `KafkaModule` - For event publishing
- `AutomaticMemberModule` - For automatic member assignment
- `UploadS3Service` - For file uploads
- `NotificationRequest` - For sending notifications
- `JwtUtil` - For JWT token operations
- `AuthUtils` - For authentication utilities

## Database Schema

### User Entity
- `userId` (UUID, Primary Key)
- `username` (String, Unique)
- `firstName`, `middleName`, `lastName` (String)
- `name` (String, nullable)
- `gender` (Enum: male, female, transgender)
- `enrollmentId` (String)
- `dob` (Date, nullable)
- `email` (String, nullable)
- `address`, `pincode` (String, nullable)
- `mobile` (Number, nullable)
- `deviceId` (String array, nullable)
- `temporaryPassword` (Boolean, default: true)
- `createdBy`, `updatedBy` (String, nullable)
- `status` (Enum: active, inactive, archived, default: active)
- `reason` (String, nullable)
- `lastLogin` (Timestamp, nullable)
- `createdAt`, `updatedAt` (Timestamp)

### Relationships
- `User` → `UserTenantMapping` (OneToMany)
- `User` → `UserRoleMapping` (OneToMany)
- `User` → `CohortMembers` (via userId)
- `User` → `FieldValues` (via itemId)

## API Endpoints

### Get User - GET `/read/:userId`

**API ID**: `api.user.get`

**Route**: `GET /user/v1/read/:userId`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required) - Tenant ID for filtering
- `Authorization` (required) - JWT token

**Query Parameters**:
- `fieldvalue` (optional, string) - Set to "true" to include custom fields

**Path Parameters**:
- `userId` (required, UUID) - User ID to retrieve

**Request**: None (GET request)

**Response**:
- **Success (200)**: User details with optional custom fields
  ```json
  {
    "id": "api.user.get",
    "ver": "1.0",
    "ts": "2024-01-01T00:00:00.000Z",
    "params": {
      "resmsgid": "uuid",
      "status": "successful",
      "successmessage": "User retrieved successfully"
    },
    "responseCode": 200,
    "result": {
      // User data with optional custom fields
    }
  }
  ```
- **Error (400)**: Bad Request - Missing tenantId
- **Error (404)**: User Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `tenantId` from headers (required)
2. Extract `userId` from path parameter
3. Parse `fieldvalue` query parameter (default: false)
4. Call `userService.getUsersDetailsById()` with:
   - `context`: "USERS"
   - `tenantId`: from headers
   - `userId`: from path
   - `fieldValue`: boolean from query param
5. Service retrieves user from database with tenant filtering
6. If `fieldValue` is true, includes custom fields from `FieldValues` table
7. Returns formatted response

**Edge Cases**:
- Missing `tenantId` header → 400 Bad Request
- Invalid `userId` format → 400 Bad Request (handled by `ParseUUIDPipe`)
- User not found → 404 Not Found
- User exists but not in specified tenant → 404 Not Found

**Dependencies**:
- `UserService.getUsersDetailsById()`
- `FieldsService` (if custom fields requested)

**Side Effects**: None

---

### Create User - POST `/create`

**API ID**: `api.user.create`

**Route**: `POST /user/v1/create`

**Authentication**: Not required (commented out in code)

**Headers**:
- `academicyearid` (optional) - Academic Year ID

**Request Body** (`UserCreateDto`):
```typescript
{
  userId?: string;
  username: string; // Required, unique
  firstName: string; // Required, max 50 chars
  middleName?: string; // Optional, max 50 chars
  lastName: string; // Required, max 50 chars
  gender: "male" | "female" | "transgender"; // Required
  enrollmentId: string; // Required
  dob?: string; // Optional, ISO date string, not in future
  email?: string; // Optional, valid email
  address?: string; // Optional
  pincode?: string; // Optional
  mobile?: string; // Optional, valid phone number
  tenantCohortRoleMapping?: tenantRoleMappingDto[]; // Optional
  customFields?: FieldValuesOptionDto[]; // Optional
  automaticMember?: AutomaticMemberDto; // Optional
  createdBy?: string; // Optional, UUID
}
```

**Response**:
- **Success (201)**: User created successfully
  ```json
  {
    "id": "api.user.create",
    "ver": "1.0",
    "params": {
      "status": "successful",
      "successmessage": "User created successfully"
    },
    "responseCode": 201,
    "result": {
      "userId": "uuid",
      // User data
    }
  }
  ```
- **Error (400)**: Validation errors
- **Error (403)**: User already exists
- **Error (409)**: Duplicate data
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body using `ValidationPipe`
2. Extract `academicYearId` from headers (optional)
3. Call `userService.createUser()` with:
   - Request object
   - `UserCreateDto`
   - `academicYearId`
   - Response object
4. Service performs:
   - Check if username exists in Keycloak
   - Check if username exists in database
   - Create user in Keycloak (if not exists)
   - Create user in database
   - If `tenantCohortRoleMapping` provided:
     - Create `UserTenantMapping` records
     - Create `CohortMembers` records
     - Create `UserRoleMapping` records
   - If `automaticMember` provided:
     - Call `automaticMemberMapping()` for automatic assignment
   - If `customFields` provided:
     - Create `FieldValues` records
   - Publish Kafka event (if enabled)
5. Return formatted response

**Edge Cases**:
- Username already exists → 403 Forbidden
- Email already exists → 409 Conflict
- Invalid UUID format in mappings → 400 Bad Request
- Keycloak service unavailable → 500 Internal Server Error
- Invalid academic year → 400 Bad Request

**Dependencies**:
- `UserService.createUser()`
- `AutomaticMemberService` (if automatic member enabled)
- `KafkaService` (if enabled)
- Keycloak API

**Side Effects**:
- Creates user in Keycloak
- Creates database records (User, UserTenantMapping, CohortMembers, UserRoleMapping, FieldValues)
- Publishes Kafka event: `user.created`
- Sends notification (if configured)

---

### Update User - PATCH `/update/:userid`

**API ID**: `api.user.update`

**Route**: `PATCH /user/v1/update/:userid`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (optional) - Tenant ID
- `Authorization` (required) - JWT token

**Path Parameters**:
- `userid` (required, UUID) - User ID to update

**Request Body** (`UserUpdateDTO`):
```typescript
{
  userData: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email?: string;
    mobile?: string;
    address?: string;
    pincode?: string;
    dob?: string;
    gender?: string;
    status?: "active" | "inactive" | "archived";
    reason?: string;
    tenantId?: string;
    updatedBy?: string; // Auto-set from token
    createdBy?: string; // Auto-set from token
  };
  userId?: string; // Auto-set from path
  customFields?: FieldValuesOptionDto[];
  tenantCohortRoleMapping?: tenantRoleMappingDto[];
}
```

**Response**:
- **Success (200)**: User updated successfully
- **Error (400)**: Bad Request
- **Error (404)**: User Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `loginUserId` from JWT token using `@GetUserId` decorator
2. Extract `userid` from path parameter
3. Extract `tenantId` from headers (optional)
4. Set `userUpdateDto.userData.updatedBy = loginUserId`
5. Set `userUpdateDto.userData.createdBy = loginUserId`
6. Set `userUpdateDto.userId = userid`
7. Set `userUpdateDto.userData.tenantId = tenantId` (if provided)
8. Call `userService.updateUser()` with:
   - `UserUpdateDTO`
   - Response object
9. Service performs:
   - Validate user exists
   - Update user in database
   - Update user in Keycloak (if username/email changed)
   - Update custom fields (if provided)
   - Update tenant/cohort/role mappings (if provided)
   - Publish Kafka event (if enabled)
10. Return formatted response

**Edge Cases**:
- User not found → 404 Not Found
- Invalid `userid` format → 400 Bad Request
- Email already exists (if changed) → 409 Conflict
- Username already exists (if changed) → 403 Forbidden
- Keycloak update fails → 500 Internal Server Error

**Dependencies**:
- `UserService.updateUser()`
- `KafkaService` (if enabled)
- Keycloak API

**Side Effects**:
- Updates user in database
- Updates user in Keycloak (if applicable)
- Updates related mappings
- Publishes Kafka event: `user.updated`

---

### Search Users - POST `/list`

**API ID**: `api.user.list`

**Route**: `POST /user/v1/list`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required) - Tenant ID for filtering
- `Authorization` (required) - JWT token

**Request Body** (`UserSearchDto`):
```typescript
{
  filters?: {
    state?: string;
    district?: string[];
    block?: string[];
    village?: string[];
    role?: string;
    username?: string[];
    userId?: string[]; // UUID array
    email?: string[]; // Email array
    status?: ("active" | "inactive")[];
    tenantStatus?: ("active" | "inactive" | "archived")[];
    // ... more filters
  };
  search?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    username?: string;
  };
  sort?: {
    field: string;
    order: "ASC" | "DESC";
  };
  pagination?: {
    page: number;
    limit: number;
  };
  includeCustomFields?: string; // "true" or "false", default: "true"
}
```

**Response**:
- **Success (200)**: User list with pagination
  ```json
  {
    "id": "api.user.list",
    "params": {
      "status": "successful"
    },
    "responseCode": 200,
    "result": {
      "data": [...users],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 100
      }
    }
  }
  ```

**Business Logic**:
1. Extract `tenantId` from headers (required)
2. Parse `includeCustomFields` from DTO (default: true)
3. Call `userService.searchUser()` with:
   - `tenantId`
   - Request object
   - Response object
   - `UserSearchDto`
   - `shouldIncludeCustomFields` boolean
4. Service performs:
   - Build query with filters
   - Apply tenant filtering
   - Apply search criteria
   - Apply sorting
   - Apply pagination
   - Include custom fields if requested
   - Return paginated results
5. Return formatted response

**Edge Cases**:
- Missing `tenantId` → 400 Bad Request
- Invalid filter values → 400 Bad Request
- No users found → Empty array with pagination
- Invalid pagination parameters → 400 Bad Request

**Dependencies**:
- `UserService.searchUser()`
- `FieldsService` (if custom fields included)

**Side Effects**: None

---

### Delete User - DELETE `/delete/:userId`

**API ID**: `api.user.delete`

**Route**: `DELETE /user/v1/delete/:userId`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `Authorization` (required) - JWT token

**Path Parameters**:
- `userId` (required, UUID) - User ID to delete

**Response**:
- **Success (200)**: User deleted successfully
- **Error (404)**: User Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from path parameter
2. Call `userService.deleteUserById()` with:
   - `userId`
   - Response object
3. Service performs:
   - Check if user exists
   - Delete user from Keycloak (disable, not hard delete)
   - Update user status in database (soft delete)
   - Delete related mappings (optional, based on business rules)
   - Publish Kafka event (if enabled)
4. Return formatted response

**Edge Cases**:
- User not found → 404 Not Found
- User already deleted → 404 Not Found
- Keycloak deletion fails → 500 Internal Server Error

**Dependencies**:
- `UserService.deleteUserById()`
- `KafkaService` (if enabled)
- Keycloak API

**Side Effects**:
- Disables user in Keycloak
- Updates user status in database
- Publishes Kafka event: `user.deleted`

---

### Send Password Reset Link - POST `/password-reset-link`

**API ID**: `api.user.sendLinkForResetPassword`

**Route**: `POST /user/v1/password-reset-link`

**Authentication**: Not required

**Request Body** (`SendPasswordResetLinkDto`):
```typescript
{
  username: string; // Required
  redirectUrl?: string; // Optional
}
```

**Response**:
- **Success (200)**: Password reset link sent successfully
- **Error (404)**: Username not found
- **Error (400)**: Email not found for reset
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.sendPasswordResetLink()` with:
   - Request object
   - `username`
   - `redirectUrl`
   - Response object
3. Service performs:
   - Find user by username
   - Get user email (from user or creator)
   - Generate JWT token for password reset
   - Create reset link with token
   - Send email notification with reset link
4. Return formatted response

**Edge Cases**:
- Username not found → 404 Not Found
- User has no email → 400 Bad Request
- Notification service unavailable → 500 Internal Server Error

**Dependencies**:
- `UserService.sendPasswordResetLink()`
- `NotificationRequest`
- `JwtUtil`

**Side Effects**:
- Sends email notification with reset link

---

### Reset Password - POST `/reset-password`

**API ID**: `api.user.resetPassword`

**Route**: `POST /user/v1/reset-password`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`ResetUserPasswordDto`):
```typescript
{
  userName: string; // Required
  newPassword: string; // Required
}
```

**Response**:
- **Success (200)**: Password reset successfully
- **Error (403)**: Forbidden
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.resetUserPassword()` with:
   - Request object
   - `userName`
   - `newPassword`
   - Response object
3. Service performs:
   - Get Keycloak admin token
   - Reset password in Keycloak
   - Update `temporaryPassword` flag if set
4. Return formatted response

**Dependencies**:
- `UserService.resetUserPassword()`
- Keycloak API

**Side Effects**:
- Updates password in Keycloak
- Updates `temporaryPassword` flag in database

---

### Forgot Password - POST `/forgot-password`

**API ID**: `api.user.forgotPassword`

**Route**: `POST /user/v1/forgot-password`

**Authentication**: Not required

**Request Body** (`ForgotPasswordDto`):
```typescript
{
  token: string; // Required - JWT token from reset link
  newPassword: string; // Required
}
```

**Response**:
- **Success (200)**: Password reset successfully
- **Error (404)**: User not found
- **Error (400)**: Invalid or expired token
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.forgotPassword()` with:
   - Request object
   - Body
   - Response object
3. Service performs:
   - Validate JWT token
   - Extract user ID from token
   - Get Keycloak admin token
   - Reset password in Keycloak
   - Update `temporaryPassword` flag
4. Return formatted response

**Edge Cases**:
- Invalid token → 400 Bad Request
- Expired token → 400 Bad Request
- User not found → 404 Not Found
- Keycloak update fails → 500 Internal Server Error

**Dependencies**:
- `UserService.forgotPassword()`
- `JwtUtil`
- Keycloak API

**Side Effects**:
- Updates password in Keycloak
- Updates `temporaryPassword` flag

---

### Send OTP - POST `/send-otp`

**API ID**: `api.send.OTP`

**Route**: `POST /user/v1/send-otp`

**Authentication**: Not required

**Request Body** (`OtpSendDTO`):
```typescript
{
  mobile: string; // Required, phone number
}
```

**Response**:
- **Success (200)**: OTP sent successfully
- **Error (400)**: Bad Request
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.sendOtp()` with:
   - Body
   - Response object
3. Service performs:
   - Generate OTP (6 digits, configurable)
   - Store OTP with expiry (10 minutes, configurable)
   - Send OTP via SMS using notification service
4. Return formatted response

**Dependencies**:
- `UserService.sendOtp()`
- `NotificationRequest`

**Side Effects**:
- Sends SMS with OTP

---

### Verify OTP - POST `/verify-otp`

**API ID**: `api.verify.OTP`

**Route**: `POST /user/v1/verify-otp`

**Authentication**: Not required

**Request Body** (`OtpVerifyDTO`):
```typescript
{
  mobile: string; // Required
  otp: string; // Required
}
```

**Response**:
- **Success (200)**: OTP verified successfully
- **Error (400)**: Invalid or expired OTP
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.verifyOtp()` with:
   - Body
   - Response object
3. Service performs:
   - Retrieve stored OTP for mobile
   - Check if OTP matches
   - Check if OTP is not expired
   - Return verification result
4. Return formatted response

**Edge Cases**:
- OTP not found → 400 Bad Request
- OTP expired → 400 Bad Request
- OTP mismatch → 400 Bad Request

**Dependencies**:
- `UserService.verifyOtp()`

**Side Effects**: None

---

### Send Password Reset OTP - POST `/password-reset-otp`

**API ID**: `api.send.reset.otp`

**Route**: `POST /user/v1/password-reset-otp`

**Authentication**: Not required

**Request Body** (`SendPasswordResetOTPDto`):
```typescript
{
  username: string; // Required
}
```

**Response**:
- **Success (200)**: Password reset OTP sent successfully
- **Error (404)**: Username not found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.sendPasswordResetOTP()` with:
   - Body
   - Response object
3. Service performs:
   - Find user by username
   - Get user mobile number
   - Generate OTP
   - Send OTP via SMS
4. Return formatted response

**Dependencies**:
- `UserService.sendPasswordResetOTP()`
- `NotificationRequest`

**Side Effects**:
- Sends SMS with OTP

---

### Get Presigned URL - GET `/presigned-url`

**API ID**: `api.get.signedURL`

**Route**: `GET /user/v1/presigned-url`

**Authentication**: Not required

**Query Parameters**:
- `filename` (required) - File name
- `foldername` (optional) - Folder name
- `fileType` (required) - File type/MIME type

**Response**:
- **Success (200)**: Presigned URL generated
  ```json
  {
    "url": "https://s3.amazonaws.com/..."
  }
  ```

**Business Logic**:
1. Extract query parameters
2. Call `uploadS3Service.getPresignedUrl()` with:
   - `filename`
   - `fileType`
   - Response object
   - `foldername`
3. Service generates AWS S3 presigned URL
4. Return URL

**Dependencies**:
- `UploadS3Service.getPresignedUrl()`
- AWS S3

**Side Effects**: None

---

### User Hierarchy View - POST `/users-hierarchy-view`

**API ID**: `api.user.hierarchyView`

**Route**: `POST /user/v1/users-hierarchy-view`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required) - Tenant ID

**Request Body** (`UserHierarchyViewDto`):
```typescript
{
  email: string; // Required
}
```

**Response**:
- **Success (200)**: User hierarchy retrieved
- **Error (400)**: Bad Request
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `tenantId` using `@GetTenantId()` decorator
2. Validate request body
3. Call `userService.searchUserMultiTenant()` with:
   - `tenantId`
   - Request object
   - Response object
   - `UserHierarchyViewDto`
4. Service performs:
   - Search user by email across tenants
   - Return user hierarchy data
5. Return formatted response

**Dependencies**:
- `UserService.searchUserMultiTenant()`

**Side Effects**: None

---

### Hierarchical Search - POST `/hierarchical-search`

**API ID**: `api.user.list`

**Route**: `POST /user/v1/hierarchical-search`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required, UUID) - Tenant ID

**Request Body** (`HierarchicalLocationFiltersDto`):
```typescript
{
  filters?: {
    state?: string[];
    district?: string[];
    block?: string[];
    village?: string[];
    // ... location-based filters
  };
  search?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    username?: string;
  };
  sort?: {
    field: string;
    order: "ASC" | "DESC";
  };
  pagination?: {
    page: number;
    limit: number;
  };
}
```

**Response**:
- **Success (200)**: User list based on hierarchical location filters

**Business Logic**:
1. Extract `tenantId` from headers
2. Validate `tenantId` (must be valid UUID)
3. Validate request body
4. Call `userService.getUsersByHierarchicalLocation()` with:
   - `tenantId`
   - Request object
   - Response object
   - `HierarchicalLocationFiltersDto`
5. Service performs:
   - Build query with hierarchical location filters
   - Apply tenant filtering
   - Apply search criteria
   - Apply sorting
   - Apply pagination
   - Return paginated results
6. Return formatted response

**Edge Cases**:
- Missing `tenantId` → 400 Bad Request
- Invalid `tenantId` format → 400 Bad Request
- Empty `tenantId` → 400 Bad Request

**Dependencies**:
- `UserService.getUsersByHierarchicalLocation()`

**Side Effects**: None

---

### Check User - POST `/check`

**API ID**: `api.user.create`

**Route**: `POST /user/v1/check`

**Authentication**: Not required

**Request Body** (`ExistUserDto`):
```typescript
{
  username?: string;
  email?: string;
  // ... other identifiers
}
```

**Response**:
- **Success (200)**: User existence check result

**Business Logic**:
1. Validate request body
2. Call `userService.checkUser()` with:
   - Request object
   - Response object
   - `ExistUserDto`
3. Service checks if user exists by provided identifiers
4. Return check result

**Dependencies**:
- `UserService.checkUser()`

**Side Effects**: None

---

### Suggest Username - POST `/suggestUsername`

**API ID**: `api.suggest.username`

**Route**: `POST /user/v1/suggestUsername`

**Authentication**: Not required

**Request Body** (`SuggestUserDto`):
```typescript
{
  firstName: string; // Required
  lastName: string; // Required
  // ... other fields for username generation
}
```

**Response**:
- **Success (200)**: Suggested username(s)
- **Error (400)**: Bad Request

**Business Logic**:
1. Validate request body
2. Call `userService.suggestUsername()` with:
   - Request object
   - Response object
   - `SuggestUserDto`
3. Service generates username suggestions based on:
   - First name
   - Last name
   - Existing usernames (to avoid duplicates)
4. Return suggestions

**Dependencies**:
- `UserService.suggestUsername()`

**Side Effects**: None

---

## Common Issues & Solutions

### Issue: User creation fails with "User already exists"
**Solution**: Check if username exists in both Keycloak and database before creation. Use `checkUser` endpoint first.

### Issue: Custom fields not appearing in user details
**Solution**: Ensure `fieldvalue=true` query parameter is passed in GET request, and custom fields are created with correct `itemId` (userId) and `contextType` ("USERS").

### Issue: Tenant isolation not working
**Solution**: Always include `tenantid` header in requests and ensure all queries filter by `tenantId`. Check `UserTenantMapping` table for correct tenant assignments.

### Issue: Password reset link not working
**Solution**: Check JWT secret configuration, token expiry settings, and notification service availability. Verify user email exists.

### Issue: OTP not received
**Solution**: Check SMS service configuration, mobile number format, and notification service availability. Verify `SMS_KEY` and `MSG91_TEMPLATE_KEY` are configured.

### Issue: Kafka events not publishing
**Solution**: Check `kafkaEnabled` configuration flag and Kafka broker connectivity. Verify topic creation and producer configuration.

### Performance Considerations
- Use pagination for user list endpoints
- Index database columns used in search filters (username, email, tenantId)
- Cache frequently accessed user data if needed
- Optimize queries with custom fields (only fetch when needed)

### Common Mistakes to Avoid
1. **Not validating tenantId**: Always validate tenantId format and presence
2. **Missing error handling**: Always handle Keycloak and external service failures
3. **Not checking user existence**: Verify user exists before update/delete operations
4. **Hardcoding values**: Use constants from `API_RESPONSES` and `APIID` config
5. **Skipping validation**: Always use DTOs with class-validator decorators
6. **Not logging errors**: Use `LoggerUtil` for error logging with context
7. **Breaking tenant isolation**: Never query users without tenantId filter
