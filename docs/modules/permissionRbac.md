# Permission RBAC Module

## Module Overview

The Permission RBAC module manages role-permission mappings for fine-grained access control. It handles assignment of permissions to roles and retrieval of role permissions.

**Purpose**: Manage role-permission mappings for detailed access control beyond basic role assignments.

**Key Entities**:
- `RolePermissionMapping` - Maps roles to permissions

**Dependencies**:
- `RbacModule` - For role and privilege management

## API Endpoints

### Role Permission Mapping

Endpoints for managing role-permission relationships, allowing fine-grained control over what actions roles can perform.

**Business Logic**: Creates and manages mappings between roles and specific permissions/privileges.

## Common Issues & Solutions

### Issue: Permissions not applied to role
**Solution**: Verify role-permission mappings are created correctly. Check permission definitions exist.

### Common Mistakes to Avoid
1. Not creating role-permission mappings
2. Missing permission definitions
