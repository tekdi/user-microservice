# Auth RBAC Module

## Module Overview

The Auth RBAC module provides RBAC-specific authentication endpoints. It handles authentication with role-based access control context.

**Purpose**: Provide authentication endpoints specifically for RBAC-enabled access with role and permission context.

**Key Entities**: None (uses authentication tokens)

**Dependencies**:
- `RbacModule` - For role and permission validation
- Keycloak - For authentication

## API Endpoints

### RBAC Token - POST `/rbac/token`

**API ID**: `api.rbac.token`

**Route**: `POST /user/v1/authRbac/rbac/token`

**Authentication**: Not required

**Request Body**: Credentials with RBAC context

**Response**: JWT token with RBAC claims

**Business Logic**: Authenticates user and generates JWT token with role and permission claims embedded.

## Common Issues & Solutions

### Issue: RBAC token missing permissions
**Solution**: Verify user has roles assigned and roles have permissions mapped. Check token claims.

### Common Mistakes to Avoid
1. Not including RBAC context in token
2. Missing role-permission mappings
