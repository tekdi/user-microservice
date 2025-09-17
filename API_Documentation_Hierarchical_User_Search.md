# Hierarchical User Search API Documentation

## Overview
The Hierarchical User Search API provides a powerful and flexible way to search and retrieve users based on hierarchical location filters (state, district, block, village, center, batch) and role-based filters. It supports pagination, sorting, and custom field inclusion with optimized performance.

---

## API Endpoint

**POST** `/user/hierarchical-search`

**Content-Type**: `application/json`

**Headers Required**:
- `tenantid`: (Required) Valid UUID representing the tenant

---

## Request Structure

### Request Body Schema

```json
{
  "limit": number,           // Required: 1-100
  "offset": number,          // Required: ≥0
  "sort": [string, string],  // Required: [field, direction]
  "filters": {               // Required: Location filters object
    "state": string[],       // Optional: Max 100 entries
    "district": string[],    // Optional: Max 500 entries
    "block": string[],       // Optional: Max 2000 entries
    "village": string[],     // Optional: Max 5000 entries  
    "center": string[],      // Optional: Max 1000 entries
    "batch": string[]        // Optional: Max 1000 entries (UUIDs)
  },
  "role": string[],          // Optional: Max 50 roles
  "customfields": string[]   // Optional: Location-based custom fields only
}
```

### Request Parameters Details

#### **Pagination Parameters**
- **`limit`** (Required)
  - Type: `number`
  - Range: 1-100
  - Description: Number of records to return
  - Example: `10`

- **`offset`** (Required)  
  - Type: `number`
  - Minimum: 0
  - Description: Number of records to skip
  - Example: `0`

#### **Sorting Parameters**
- **`sort`** (Required)
  - Type: `[string, string]`
  - Format: `[field, direction]`
  - Allowed Fields: `name`, `firstName`, `lastName`, `username`, `email`, `createdAt`
  - Allowed Directions: `asc`, `desc`
  - Example: `["name", "asc"]`

#### **Filter Parameters**
- **`filters`** (Required)
  - Type: `object`
  - Description: At least one location filter OR role filter must be provided
  - Hierarchy (most specific to least): `batch` → `center` → `village` → `block` → `district` → `state`

  **Location Filter Fields**:
  - **`state`**: Array of State IDs (Max: 100)
  - **`district`**: Array of District IDs (Max: 500) 
  - **`block`**: Array of Block IDs (Max: 2000)
  - **`village`**: Array of Village IDs (Max: 5000)
  - **`center`**: Array of Center IDs (Max: 1000)
  - **`batch`**: Array of Batch/Cohort UUIDs (Max: 1000)

#### **Optional Parameters**
- **`role`** (Optional)
  - Type: `string[]`
  - Maximum: 50 roles
  - Description: Filter users by role names
  - Example: `["Instructor", "Lead", "Learner"]`

- **`customfields`** (Optional)
  - Type: `string[]`
  - Description: Custom location fields to include in response (excludes `center` and `batch` - they appear in `cohortData`)
  - Example: `["state", "district", "block", "village", "main_subject"]`

---

## Response Structure

### Success Response (200 OK)

```json
{
  "id": "api.user.list",
  "ver": "1.0", 
  "ts": "2025-01-16T10:30:00.000Z",
  "params": {
    "resmsgid": "",
    "status": "successful"
  },
  "responseCode": 200,
  "result": {
    "users": [
      {
        "userId": "uuid-123",
        "username": "user@example.com",
        "firstName": "John",
        "name": "John Doe",
        "middleName": null,
        "lastName": "Doe",
        "email": "john@example.com",
        "mobile": "9876543210",
        "gender": "male",
        "dob": "1990-01-01",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "tenantId": "tenant-uuid",
        "total_count": "25",
        "roles": ["Instructor", "Lead"],
        "customfield": {
          "state": "Maharashtra",
          "district": "Pune",
          "block": "Haveli",
          "village": "Kharadi",
          "main_subject": "Mathematics"
        },
        "cohortData": [
          {
            "centerId": "center-uuid-1",
            "centerName": "Main Learning Center",
            "batchId": "batch-uuid-1", 
            "batchName": "Mathematics Batch A",
            "cohortMember": {
              "status": "active",
              "membershipId": "membership-uuid-1"
            }
          },
          {
            "centerId": "center-uuid-2",
            "centerName": "Secondary Center",
            "batchId": "batch-uuid-2",
            "batchName": "Science Batch B", 
            "cohortMember": {
              "status": "inactive",
              "membershipId": "membership-uuid-2"
            }
          }
        ]
      }
    ],
    "totalCount": 25,
    "currentPageCount": 10,
    "limit": 10,
    "offset": 0,
    "sort": {
      "field": "name",
      "direction": "asc"
    }
  }
}
```

### Error Responses

#### 400 Bad Request - Invalid Tenant
```json
{
  "id": "api.user.list",
  "ver": "1.0",
  "ts": "2025-01-16T10:30:00.000Z",
  "params": {
    "resmsgid": "",
    "status": "failed",
    "err": "TENANTID_VALIDATION",
    "errmsg": "Invalid tenant information"
  },
  "responseCode": 400,
  "result": {}
}
```

#### 404 Not Found - No Users Found
```json
{
  "id": "api.user.list",
  "ver": "1.0",
  "ts": "2025-01-16T10:30:00.000Z", 
  "params": {
    "resmsgid": "",
    "status": "failed",
    "err": "Not Found",
    "errmsg": "User does not exist for given filters"
  },
  "responseCode": 404,
  "result": {}
}
```

#### 500 Internal Server Error
```json
{
  "id": "api.user.list",
  "ver": "1.0",
  "ts": "2025-01-16T10:30:00.000Z",
  "params": {
    "resmsgid": "",
    "status": "failed", 
    "err": "INTERNAL_SERVER_ERROR",
    "errmsg": "Error processing hierarchical filters: [detailed error]"
  },
  "responseCode": 500,
  "result": {}
}
```

---

## Request Examples

### Example 1: Search by State with Pagination
```json
{
  "limit": 10,
  "offset": 0,
  "sort": ["name", "asc"],
  "filters": {
    "state": ["maharashtra-uuid", "gujarat-uuid"]
  },
  "customfields": ["state", "district", "block"]
}
```

### Example 2: Search by Multiple Batches with Role Filter
```json
{
  "limit": 25,
  "offset": 0, 
  "sort": ["createdAt", "desc"],
  "filters": {
    "batch": ["batch-uuid-1", "batch-uuid-2", "batch-uuid-3"]
  },
  "role": ["Instructor", "Lead"],
  "customfields": ["state", "district", "main_subject", "subject"]
}
```

### Example 3: Complex Hierarchical Search with Custom Fields
```json
{
  "limit": 50,
  "offset": 25,
  "sort": ["firstName", "asc"],
  "filters": {
    "district": ["pune-uuid", "mumbai-uuid"],
    "center": ["center-uuid-1", "center-uuid-2"]
  },
  "role": ["Learner", "Content creator"],
  "customfields": ["state", "district", "block", "village", "main_subject"]
}
```

### Example 4: Role-Only Search 
```json
{
  "limit": 100,
  "offset": 0,
  "sort": ["email", "asc"], 
  "filters": {},
  "role": ["Super Admin", "State Lead", "Central Lead"]
}
```

### Example 5: Village-Level Search with Sorting
```json
{
  "limit": 15,
  "offset": 30,
  "sort": ["lastName", "desc"],
  "filters": {
    "village": ["village-uuid-1", "village-uuid-2", "village-uuid-3"]
  },
  "customfields": ["state", "district", "block", "village"]
}
```

---

## API Workflow

### 1. **Request Validation**
- Validate tenant ID from headers
- Validate request body structure and constraints
- Ensure at least one filter (location or role) is provided
- Check array size limits for all filter types

### 2. **Filter Processing**
```
┌─────────────────────────────────────────────┐
│            Filter Hierarchy                 │
├─────────────────────────────────────────────┤
│  Most Specific → Least Specific            │
│                                             │
│  1. Batch (Educational Cohorts)             │
│  2. Center (Learning Centers)               │  
│  3. Village (Administrative)                │
│  4. Block (Administrative)                  │
│  5. District (Administrative)               │
│  6. State (Administrative)                  │
└─────────────────────────────────────────────┘
```

- **Step 1**: Find the most specific location filter provided
- **Step 2**: Execute location-based filtering (if any)
- **Step 3**: Execute role-based filtering (if any) 
- **Step 4**: Combine results using Set intersection for optimal performance

### 3. **Data Retrieval & Optimization**
- **Parallel Execution**: Run 3 optimized queries simultaneously:
  1. **User Data Query**: Combined count + paginated user details
  2. **Custom Fields Query**: Location-based custom field values
  3. **Cohort Data Query**: All batch/center associations per user

### 4. **Response Construction**
- Aggregate user roles from multiple role assignments
- Build `customfield` object with location-based data only
- Build `cohortData` array with all batch/center associations
- Apply pagination and sorting
- Return structured response

---

## Business Rules

### **Filter Priority & Logic**
1. **Hierarchical Priority**: The system selects the MOST SPECIFIC filter provided
   - If both `state` and `district` are provided → Uses `district` only
   - If both `block` and `batch` are provided → Uses `batch` only

2. **Filter Combination**: 
   - **Location + Role**: Intersection (users matching BOTH conditions)
   - **Location Only**: Users matching location filter
   - **Role Only**: Users matching role filter

3. **Custom Field Separation**:
   - `customfield`: Contains location-based data (`state`, `district`, `block`, `village`, etc.)
   - `cohortData`: Contains batch/center associations with membership details

### **Performance Safeguards**
- Array size limits prevent DoS attacks
- O(n) Set intersection instead of O(n²) array filtering
- Combined database queries reduce round trips
- Indexed database queries for optimal performance

### **Data Integrity**
- Only active, non-archived users are returned
- Cohort membership status is preserved in `cohortData`
- Multiple batch/center associations per user are fully supported

---

## Use Cases

### **1. Administrative Reporting**
Find all instructors in a specific state for training programs:
```json
{
  "filters": {"state": ["maharashtra-uuid"]},
  "role": ["Instructor"],
  "sort": ["name", "asc"],
  "limit": 100, "offset": 0
}
```

### **2. Batch Management**
Get all learners in specific batches with their center information:
```json
{
  "filters": {"batch": ["math-batch-1", "science-batch-2"]}, 
  "role": ["Learner"],
  "sort": ["createdAt", "desc"],
  "limit": 50, "offset": 0
}
```

### **3. Geographic Analysis** 
Analyze user distribution with location details:
```json
{
  "filters": {"district": ["pune-uuid", "nashik-uuid"]},
  "customfields": ["state", "district", "block", "village"],
  "sort": ["name", "asc"],
  "limit": 200, "offset": 0
}
```

### **4. Multi-Role Search**
Find users with administrative roles across all locations:
```json
{
  "filters": {},
  "role": ["Super Admin", "State Lead", "Central Lead"],
  "sort": ["email", "asc"], 
  "limit": 25, "offset": 0
}
```

### **5. Detailed User Profiles**
Get comprehensive user information with cohort associations:
```json
{
  "filters": {"center": ["main-center-uuid"]},
  "customfields": ["state", "district", "main_subject", "qualification"],
  "sort": ["firstName", "asc"],
  "limit": 30, "offset": 0
}
```

---

## Best Practices

### **Request Optimization**
1. Use the most specific location filter possible
2. Limit `customfields` to only required fields
3. Use appropriate page sizes (10-50 for UI, larger for exports)
4. Implement proper error handling for all response codes

### **Performance Considerations**
1. **Pagination**: Always use pagination for large result sets
2. **Filtering**: Be specific with filters to reduce result set size  
3. **Custom Fields**: Only request fields you actually need
4. **Caching**: Consider caching responses for frequently accessed data

### **Security Guidelines**
1. Always validate tenant ID
2. Implement proper authentication before API access
3. Log API usage for audit trails
4. Monitor for unusual request patterns

---

## Response Field Descriptions

### **User Fields**
- `userId`: Unique user identifier (UUID)
- `username`: User login name
- `firstName`, `name`, `middleName`, `lastName`: User name components
- `email`: User email address
- `mobile`: User phone number
- `gender`: User gender
- `dob`: Date of birth (ISO date string)
- `status`: User account status
- `createdAt`: Account creation timestamp (ISO datetime)
- `tenantId`: Associated tenant ID
- `total_count`: Total records matching filters (for pagination)
- `roles`: Array of role names assigned to user

### **Custom Field Object**
- Contains location-based custom field values
- Field names vary based on `customfields` request parameter
- Values can be strings, numbers, or null

### **Cohort Data Array**
- `centerId`: Learning center UUID (nullable)
- `centerName`: Learning center name (nullable)
- `batchId`: Batch/cohort UUID
- `batchName`: Batch/cohort name (nullable)
- `cohortMember.status`: Membership status (active/inactive)
- `cohortMember.membershipId`: Unique membership record ID

---

This API provides a comprehensive, performant, and flexible solution for hierarchical user search with proper security, validation, and optimization built-in.