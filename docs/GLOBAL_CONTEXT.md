# Global Context - User Microservice

## Project Overview

The User Microservice is a NestJS-based service that manages user data, tenant relationships, cohorts, roles, privileges, and custom fields for the Shiksha Platform. It supports multi-tenancy and provides comprehensive user management capabilities including authentication, authorization, and user profile management.

**Key Concepts:**
- **Tenant**: High-level grouping of users (similar to a domain)
- **Cohort**: Granular grouping of users based on common attributes
- **Roles**: Application-level roles specific to each tenant
- **Privileges**: Used for Role-Based Access Control (RBAC)
- **Fields**: Core (database columns) and custom fields (stored separately)

**Base URL**: `/user/v1` (configured in `main.ts`)
**Port**: 3000
**API Version**: 1.0

## Architecture Patterns

### Framework & Technology Stack
- **Framework**: NestJS (v11.x)
- **Language**: TypeScript (v4.9.5)
- **Database**: PostgreSQL with TypeORM (v0.3.27)
- **Authentication**: JWT with Keycloak
- **Message Queue**: Kafka (optional, configurable)
- **File Storage**: AWS S3
- **API Documentation**: Swagger/OpenAPI

### Module Structure
- Each feature is organized as a NestJS module
- Modules follow the pattern: `{module-name}.module.ts`, `{module-name}.controller.ts`, `{module-name}.service.ts`
- DTOs are stored in `dto/` subdirectory
- Entities are stored in `entities/` or `entity/` subdirectory
- Modules are registered in `app.module.ts`

### Dependency Injection
- Services are injected via constructor injection
- Use `@Injectable()` decorator for services
- Use `@InjectRepository()` for TypeORM repositories
- Modules export services that need to be used by other modules

### Request/Response Flow
```
Controller → Service → Repository → Database
     ↓           ↓
  DTO Validation  Business Logic
     ↓           ↓
  Response Format  Error Handling
```

## Code Standards & Conventions

### Naming Conventions
- **Controllers**: `{Module}Controller` (e.g., `UserController`)
- **Services**: `{Module}Service` (e.g., `UserService`)
- **DTOs**: `{Module}{Action}Dto` (e.g., `UserCreateDto`, `UserUpdateDTO`)
- **Entities**: PascalCase singular (e.g., `User`, `Tenant`, `Cohort`)
- **Files**: kebab-case (e.g., `user.controller.ts`, `user-create.dto.ts`)
- **Methods**: camelCase (e.g., `getUser`, `createUser`)

### File Organization
```
src/
├── {module}/
│   ├── {module}.module.ts
│   ├── {module}.controller.ts
│   ├── {module}.service.ts
│   ├── dto/
│   │   └── {module}-{action}.dto.ts
│   ├── entities/
│   │   └── {entity}.entity.ts
│   └── interfaces/
│       └── {interface}.ts
├── common/
│   ├── filters/
│   ├── guards/
│   ├── decorators/
│   ├── responses/
│   └── utils/
└── utils/
```

### Code Length Restrictions
- **NO LONG CODE**: Keep functions concise and focused
- Maximum function length: ~100-150 lines (prefer breaking into smaller functions)
- Maximum file length: ~500-800 lines (consider splitting into multiple files)
- Extract complex logic into separate utility functions or helper methods
- Use early returns to reduce nesting

### TypeScript Best Practices
- Always use explicit types for function parameters and return types
- Use interfaces for object shapes, types for unions/intersections
- Prefer `async/await` over promises chains
- Use optional chaining (`?.`) and nullish coalescing (`??`) appropriately
- Avoid `any` type - use `unknown` if type is truly unknown
- Use enums for fixed sets of values
- Leverage TypeORM decorators for entity definitions

### Code Quality
- Use ESLint and Prettier (configured in project)
- Follow NestJS decorator patterns consistently
- Use class-validator for DTO validation
- Use class-transformer for data transformation
- Maintain consistent error handling patterns

## Impact Analysis Requirements

### Before Making Any Changes

1. **Check Module Dependencies**
   - Review `{module}.module.ts` to see imported modules
   - Check if other modules depend on the module being changed
   - Verify service exports/imports

2. **Verify Database Schema Impacts**
   - Check entity definitions in `entities/` directory
   - Review TypeORM relationships (OneToMany, ManyToOne, ManyToMany)
   - Ensure migrations are considered for schema changes
   - Check for foreign key constraints

3. **Check for Breaking Changes in APIs**
   - Review Swagger decorators in controllers
   - Check DTO structures and validation rules
   - Verify response format consistency
   - Check API ID mappings in `api-id.config.ts`

4. **Review Module Dependencies**
   - Check `app.module.ts` for module registration order
   - Verify circular dependency risks
   - Review shared services and utilities

5. **External Service Dependencies**
   - Check Kafka event publishing
   - Review notification service calls
   - Verify S3 file operations
   - Check Keycloak authentication flows

6. **Tenant Isolation**
   - Ensure all queries filter by `tenantId`
   - Verify multi-tenancy is preserved
   - Check that tenant context is passed correctly

## Problem-Solving Methodology

### Steps to Follow When Fixing Bugs

1. **Identify Root Cause**
   - Check error logs using `LoggerUtil`
   - Review exception filter output
   - Trace request flow through controller → service → repository
   - Check database queries and relationships

2. **Understand Context**
   - Review API documentation for the affected endpoint
   - Check DTO validation rules
   - Verify authentication/authorization requirements
   - Review business logic flow

3. **Check Dependencies**
   - Verify module imports are correct
   - Check service dependencies
   - Review database entity relationships
   - Verify external service integrations

4. **Implement Fix**
   - Follow existing code patterns
   - Maintain response format consistency
   - Preserve tenant isolation
   - Add appropriate error handling

5. **Test Requirements**
   - Test success scenarios
   - Test error scenarios (400, 404, 500)
   - Test edge cases
   - Verify tenant isolation
   - Test with different user roles

6. **Document Changes**
   - Update module documentation if API changes
   - Update global context if patterns change
   - Document new edge cases discovered

## Response Format Standards

### Success Response Structure
All successful responses use `APIResponse.success()`:
```typescript
{
  id: string,              // API ID from APIID config
  ver: "1.0",
  ts: string,             // ISO timestamp
  params: {
    resmsgid: string,     // UUID
    status: "successful",
    err: null,
    errmsg: null,
    successmessage: string
  },
  responseCode: number,   // HTTP status code (200, 201, etc.)
  result: any            // Response data
}
```

### Error Response Structure
All errors use `APIResponse.error()`:
```typescript
{
  id: string,            // API ID from APIID config
  ver: "1.0",
  ts: string,            // ISO timestamp
  params: {
    resmsgid: string,    // UUID
    status: "failed",
    err: string,         // Error type (e.g., "BadRequestException")
    errmsg: string       // Error message
  },
  responseCode: number,  // HTTP status code (400, 404, 500, etc.)
  result: {}
}
```

### Response Messages
- All response messages are defined in `src/common/utils/response.messages.ts` as `API_RESPONSES`
- Use constants from `API_RESPONSES` instead of hardcoded strings
- Follow naming convention: `{MODULE}_{ACTION}_{STATUS}`

### HTTP Status Codes
- `200 OK`: Successful GET, PATCH, DELETE
- `201 Created`: Successful POST (create)
- `400 Bad Request`: Validation errors, invalid input
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Duplicate data, conflicts
- `500 Internal Server Error`: Server errors

## Authentication & Authorization

### JWT Authentication
- **Guard**: `JwtAuthGuard` from `src/common/guards/keycloak.guard.ts`
- **Usage**: `@UseGuards(JwtAuthGuard)` on controller methods
- **Token**: Passed in `Authorization` header
- **Swagger**: `@ApiBasicAuth("access-token")` decorator

### Tenant Isolation
- **Header**: `tenantid` (required for most endpoints)
- **Validation**: Check for tenantId in headers before processing
- **Database Queries**: Always filter by `tenantId` in WHERE clauses
- **Decorator**: `@GetTenantId()` for extracting tenant ID

### User Context
- **Decorator**: `@GetUserId("loginUserId", ParseUUIDPipe)` for extracting user ID from token
- **Usage**: Use for `createdBy`, `updatedBy` fields
- **Validation**: Ensure UUID format using `ParseUUIDPipe`

### Academic Year Context
- **Header**: `academicyearid` (required for some endpoints)
- **Validation**: Check if UUID format when required

## Database Patterns

### TypeORM Usage
- **Entities**: Use `@Entity()` decorator
- **Repositories**: Inject using `@InjectRepository(Entity)`
- **Queries**: Use TypeORM QueryBuilder or repository methods
- **Relations**: Use decorators (`@OneToMany`, `@ManyToOne`, `@ManyToMany`)

### Entity Patterns
- Primary keys: Use UUID (`@PrimaryGeneratedColumn('uuid')`)
- Timestamps: Use `@CreateDateColumn()` and `@UpdateDateColumn()`
- Soft deletes: Use `@DeleteDateColumn()` if applicable
- Tenant isolation: Include `tenantId` column in entities

### Query Patterns
- Always filter by `tenantId` for multi-tenant queries
- Use `ILike` for case-insensitive searches
- Use `In()` for array-based filters
- Use transactions for multi-step operations (if needed)

### Database Connection
- Configured in `src/common/database.module.ts`
- Connection pool: max 20 connections
- Auto-load entities: enabled
- Connection timeout: 2 seconds

## Error Handling

### Exception Filter
- **Filter**: `AllExceptionsFilter` from `src/common/filters/exception.filter.ts`
- **Usage**: `@UseFilters(new AllExceptionsFilter(APIID.{API_ID}))` on controller methods
- **Purpose**: Centralized error handling and response formatting
- **Behavior**: Catches all exceptions and formats them using `APIResponse.error()`

### Logging
- **Utility**: `LoggerUtil` from `src/common/logger/LoggerUtil.ts`
- **Methods**: `log()`, `error()`, `warn()`, `debug()`
- **Format**: JSON with timestamp, context, user, level, message, error
- **Usage**: Log important operations, errors, and warnings

### Error Scenarios to Handle
- Missing required headers (tenantid, academicyearid)
- Invalid UUID format
- Resource not found (404)
- Validation errors (400)
- Duplicate data (409)
- Database errors (500)
- External service failures (Kafka, S3, notifications)

### Error Response Patterns
- Always use `APIResponse.error()` for error responses
- Include appropriate HTTP status code
- Provide clear error messages from `API_RESPONSES`
- Log errors with context using `LoggerUtil.error()`

## API Documentation Standards

### Swagger Decorators
- **Tags**: `@ApiTags("ModuleName")` on controllers
- **Responses**: `@ApiOkResponse()`, `@ApiCreatedResponse()`, `@ApiBadRequestResponse()`, etc.
- **Body**: `@ApiBody({ type: DtoClass })` for request bodies
- **Query**: `@ApiQuery()` for query parameters
- **Header**: `@ApiHeader()` for required headers
- **Auth**: `@ApiBasicAuth("access-token")` for authenticated endpoints

### DTO Validation
- Use `class-validator` decorators:
  - `@IsString()`, `@IsEmail()`, `@IsUUID()`, `@IsOptional()`, `@IsNotEmpty()`, etc.
- Use `@UsePipes(ValidationPipe)` or `@UsePipes(new ValidationPipe())` on endpoints
- Validation errors return 400 Bad Request

### Serialization
- Use `@SerializeOptions({ strategy: "excludeAll" })` to exclude undefined properties
- Use `@Exclude()` decorator on entity properties to hide sensitive data
- Transform data using `class-transformer` decorators

## External Integrations

### Kafka
- **Service**: `KafkaService` from `src/kafka/kafka.service.ts`
- **Config**: Enabled via `kafkaEnabled` config flag
- **Usage**: Publish events for user creation, updates, etc.
- **Topics**: Created automatically if they don't exist
- **Pattern**: Check if Kafka is enabled before publishing

### AWS S3
- **Service**: `UploadS3Service` from `src/common/services/upload-S3.service.ts`
- **Usage**: File uploads, signed URLs for file access
- **Pattern**: Generate signed URLs for secure file access

### Notification Service
- **Service**: `NotificationRequest` from `src/common/utils/notification.axios.ts`
- **Usage**: Send notifications (email, SMS, etc.)
- **Error Handling**: Handle service unavailability gracefully
- **Pattern**: Use HTTP service with proper error handling

### Keycloak
- **Integration**: JWT token validation
- **Usage**: Authentication and user context extraction
- **Pattern**: Validate tokens via JWT guard

## Critical Rules for LLM Agents

### Code Modification Rules
1. **Always check module dependencies** before modifying code
2. **Maintain response format consistency** - use `APIResponse` class
3. **Preserve tenant isolation** - always filter by `tenantId` in queries
4. **Follow existing error handling patterns** - use `AllExceptionsFilter`
5. **Keep code concise** - no long functions, break into smaller pieces
6. **Use existing DTOs and validation patterns** - don't create new patterns
7. **Maintain API ID mapping consistency** - use constants from `APIID` config
8. **Follow NestJS decorator patterns** - use standard decorators

### API Modification Rules
1. **Never change response structure** without updating documentation
2. **Always validate input** using DTOs and class-validator
3. **Always handle errors** using exception filters
4. **Always log important operations** using `LoggerUtil`
5. **Always check tenant context** before database operations
6. **Always use API IDs** from `APIID` config for error responses

### Database Modification Rules
1. **Always filter by tenantId** in multi-tenant queries
2. **Check entity relationships** before modifying schemas
3. **Use TypeORM patterns** consistently
4. **Consider migrations** for schema changes
5. **Preserve data integrity** with proper constraints

### Testing Requirements
1. Test with valid data
2. Test with invalid data (validation errors)
3. Test with missing resources (404 errors)
4. Test tenant isolation (different tenants)
5. Test authentication/authorization
6. Test edge cases

## Common Patterns

### Controller Pattern
```typescript
@UseFilters(new AllExceptionsFilter(APIID.{API_ID}))
@HttpMethod("path")
@UseGuards(JwtAuthGuard) // if auth required
@ApiBasicAuth("access-token")
@ApiOkResponse({ description: API_RESPONSES.{MESSAGE} })
public async methodName(
  @Headers() headers,
  @Req() request: Request,
  @Res() response: Response,
  @Body() dto: DtoClass,
  // other params
) {
  // Extract headers (tenantid, academicyearid)
  // Call service method
  // Return response
}
```

### Service Pattern
```typescript
async methodName(params): Promise<Result> {
  // Validate inputs
  // Check tenant context
  // Perform business logic
  // Database operations
  // External service calls (if needed)
  // Return result
}
```

### Response Pattern
```typescript
// Success
return APIResponse.success(
  response,
  APIID.{API_ID},
  result,
  HttpStatus.OK,
  API_RESPONSES.{SUCCESS_MESSAGE}
);

// Error (handled by exception filter)
throw new HttpException(
  API_RESPONSES.{ERROR_MESSAGE},
  HttpStatus.{STATUS_CODE}
);
```

## Version Information
- **NestJS**: ^11.1.9
- **TypeORM**: ^0.3.27
- **TypeScript**: ^4.9.5
- **Node**: >=20.0.0
- **PostgreSQL**: (version from environment)

## Additional Resources
- Swagger Documentation: `/swagger-docs` (when server is running)
- Health Check: `/health` (GET)
- API Base Path: `/user/v1`
