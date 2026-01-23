# RBAC Module

## Module Overview

The RBAC (Role-Based Access Control) module manages roles, privileges, and their assignments to users. It includes role management, privilege management, user-role assignments, and role-privilege mappings.

**Purpose**: Manage roles, privileges, and access control assignments with support for tenant-specific roles and permissions.

**Key Entities**:
- `Role` - Role definitions
- `Privilege` - Privilege definitions
- `UserRoleMapping` - User-role assignments
- `RolePermissionMapping` - Role-privilege mappings

**Dependencies**:
- `UserModule` - For user validation
- `TenantModule` - For tenant context

## API Endpoints

### Role Management

#### Get Role - GET `/rbac/roles/read/:id`
**API ID**: `api.role.get`
**Authentication**: Required
**Headers**: `tenantid` (optional)
**Response**: Role details

#### Create Role - POST `/rbac/roles/create`
**API ID**: `api.role.create`
**Authentication**: Required
**Headers**: `tenantid` (required)
**Request Body**: `CreateRolesDto`
**Response**: Role created successfully

#### Update Role - PUT `/rbac/roles/update/:id`
**API ID**: `api.role.update`
**Authentication**: Required
**Headers**: `tenantid` (required)
**Request Body**: `RoleDto`
**Response**: Role updated successfully

#### Search Roles - POST `/rbac/roles/list/roles`
**API ID**: `api.role.search`
**Authentication**: Required
**Headers**: `tenantid` (required)
**Request Body**: `RoleSearchDto`
**Response**: Paginated list of roles

#### Delete Role - DELETE `/rbac/roles/delete/:id`
**API ID**: `api.role.delete`
**Authentication**: Required
**Response**: Role deleted successfully

### Privilege Management

#### Get Privilege by Role ID - GET `/rbac/privilege/read/:roleId`
**API ID**: `api.privilegebyRoleId.get`
**Authentication**: Required
**Response**: Privileges assigned to role

#### Get Privilege by Privilege ID - GET `/rbac/privilege/read/privilege/:privilegeId`
**API ID**: `api.privilegebyPrivilegeId.get`
**Authentication**: Required
**Response**: Privilege details

#### Create Privilege - POST `/rbac/privilege/create`
**API ID**: `api.privilege.create`
**Authentication**: Required
**Response**: Privilege created successfully

#### Delete Privilege - DELETE `/rbac/privilege/delete/:id`
**API ID**: `api.privilege.delete`
**Authentication**: Required
**Response**: Privilege deleted successfully

### User-Role Assignment

#### Create User-Role Assignment - POST `/rbac/userRole/create`
**API ID**: `api.userRole.create`
**Authentication**: Required
**Response**: User-role assignment created

#### Get User Roles - GET `/rbac/userRole/read/:userId`
**API ID**: `api.userRole.get`
**Authentication**: Required
**Response**: User's assigned roles

#### Delete User-Role Assignment - DELETE `/rbac/userRole/delete/:id`
**API ID**: `api.userRole.delete`
**Authentication**: Required
**Response**: Assignment deleted

### Assign Privilege

#### Create Role-Privilege Assignment - POST `/rbac/assignPrivilege/create`
**API ID**: `api.assignprivilege.create`
**Authentication**: Required
**Response**: Role-privilege assignment created

#### Get Role Privileges - GET `/rbac/assignPrivilege/read/:roleId`
**API ID**: `api.assignprivilege.get`
**Authentication**: Required
**Response**: Privileges assigned to role

## Common Issues & Solutions

### Issue: Role not appearing in tenant
**Solution**: Ensure role is created with correct `tenantId` and matches the tenant context in headers.

### Issue: Privileges not assigned to role
**Solution**: Verify role-privilege mappings are created correctly using assign privilege endpoints.

### Common Mistakes to Avoid
1. Not providing `tenantId` for tenant-specific roles
2. Not validating role/privilege existence before assignment
3. Missing user validation in user-role assignments
