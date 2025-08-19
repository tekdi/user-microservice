# Location Hierarchy API Documentation

## Overview

The Location Hierarchy API provides powerful location search capabilities with support for traversing the administrative hierarchy in both directions (parent/child), filtering by specific location types, and performing keyword-based searches.

### Administrative Hierarchy

The API works with a 4-level administrative hierarchy:

```
State
├── District
    ├── Block
        ├── Village
```

## Endpoint

### POST `/location/hierarchy-search`

**Description**: Search location hierarchy with support for parent/child traversal, target filtering, and keyword search.

---

## Request Body

```json
{
  "id": "string",                           // Required: ID of the location to start search from
  "type": "state|district|block|village",   // Required: Type of the starting location
  "direction": "child|parent",              // Required: Direction of hierarchy traversal
  "target": ["state", "district", "block", "village"], // Optional: Target location types to return
  "keyword": "string"                       // Optional: Keyword filter for location names
}
```

### Request Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `id` | string | Yes | ID of the location entity to start search from | `"27"` |
| `type` | enum | Yes | Type of location: `state`, `district`, `block`, `village` | `"state"` |
| `direction` | enum | Yes | Search direction: `child` (downward), `parent` (upward) | `"child"` |
| `target` | array | No | Specific location types to return. If omitted, returns all levels in direction | `["village"]` |
| `keyword` | string | No | Case-insensitive keyword to filter location names | `"Naba"` |

---

## Response Structure

```json
{
  "success": boolean,
  "message": "string",
  "data": [
    {
      "id": number,
      "name": "string",
      "code": "string",
      "type": "state|district|block|village",
      "parent_id": number,
      "is_active": number,
      "is_found_in_census": number
    }
  ],
  "totalCount": number,
  "searchParams": {
    "id": "string",
    "type": "string", 
    "direction": "string",
    "target": ["string"],
    "keyword": "string"
  }
}
```

---

## Usage Examples

### 1. Get all villages under a state with keyword filter

**Use Case**: Find all villages containing "Naba" in West Bengal (state_id = 27)

**Request**:
```json
{
  "id": "27",
  "type": "state",
  "direction": "child",
  "target": ["village"],
  "keyword": "Naba"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Hierarchy search completed successfully",
  "data": [
    {
      "id": 1001,
      "name": "Naba Gram",
      "code": "NG001",
      "type": "village",
      "parent_id": 101,
      "is_active": 1,
      "is_found_in_census": 1
    },
    {
      "id": 1002,
      "name": "Naba Dighi",
      "code": "ND001", 
      "type": "village",
      "parent_id": 102,
      "is_active": 1,
      "is_found_in_census": 1
    }
  ],
  "totalCount": 2,
  "searchParams": {
    "id": "27",
    "type": "state",
    "direction": "child",
    "target": ["village"],
    "keyword": "Naba"
  }
}
```

---

### 2. Get complete parent hierarchy from a village

**Use Case**: Find all parent locations (block, district, state) for village_id = 901

**Request**:
```json
{
  "id": "901",
  "type": "village", 
  "direction": "parent"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Hierarchy search completed successfully",
  "data": [
    {
      "id": 101,
      "name": "Singur Block",
      "code": "SB001",
      "type": "block",
      "parent_id": 21,
      "is_active": 1,
      "is_found_in_census": 1
    },
    {
      "id": 21,
      "name": "Hooghly District",
      "code": "HD001",
      "type": "district", 
      "parent_id": 27,
      "is_active": 1,
      "is_found_in_census": 1
    },
    {
      "id": 27,
      "name": "West Bengal",
      "code": "WB",
      "type": "state",
      "is_active": 1,
      "is_found_in_census": 1
    }
  ],
  "totalCount": 3,
  "searchParams": {
    "id": "901",
    "type": "village",
    "direction": "parent"
  }
}
```

---

### 3. Get all districts under a state

**Use Case**: Get all districts in West Bengal (state_id = 27)

**Request**:
```json
{
  "id": "27",
  "type": "state",
  "direction": "child",
  "target": ["district"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Hierarchy search completed successfully", 
  "data": [
    {
      "id": 21,
      "name": "Hooghly",
      "code": "HD",
      "type": "district",
      "parent_id": 27,
      "is_active": 1,
      "is_found_in_census": 1
    },
    {
      "id": 22,
      "name": "Kolkata",
      "code": "KOL",
      "type": "district", 
      "parent_id": 27,
      "is_active": 1,
      "is_found_in_census": 1
    }
  ],
  "totalCount": 2,
  "searchParams": {
    "id": "27",
    "type": "state",
    "direction": "child",
    "target": ["district"]
  }
}
```

---

### 4. Get all locations under a district with multiple targets

**Use Case**: Get all blocks and villages under Hooghly district (district_id = 21)

**Request**:
```json
{
  "id": "21", 
  "type": "district",
  "direction": "child",
  "target": ["block", "village"]
}
```

---

### 5. Search with keyword across multiple levels

**Use Case**: Find all locations containing "Gram" under a district

**Request**:
```json
{
  "id": "21",
  "type": "district", 
  "direction": "child",
  "keyword": "Gram"
}
```

---

## Validation and Error Handling

### Request Validation Errors (400 Bad Request)

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "error": "BadRequestException"
}
```

**Common validation errors**:
- Invalid `type` or `direction` values
- Non-existent location ID for the specified type
- Invalid `target` types for the given direction and starting type
- Empty or invalid request body

### Entity Not Found (400 Bad Request)

```json
{
  "success": false,
  "message": "state with ID 999 not found",
  "data": null,
  "error": "BadRequestException"
}
```

### Invalid Target Types (400 Bad Request)

```json
{
  "success": false,
  "message": "Invalid target types [state] for direction 'child' from type 'village'. Valid targets: []",
  "data": null, 
  "error": "BadRequestException"
}
```

### Internal Server Error (500)

```json
{
  "success": false,
  "message": "Internal server error occurred",
  "data": null,
  "error": "Database connection failed"
}
```

---

## Feature Matrix

| Starting Type | Direction | Valid Targets | Example Use Case |
|---------------|-----------|---------------|------------------|
| **State** | child | district, block, village | Get all districts/blocks/villages in a state |
| **State** | parent | _(none)_ | _(States have no parents)_ |
| **District** | child | block, village | Get all blocks/villages in a district |
| **District** | parent | state | Get the state containing a district |
| **Block** | child | village | Get all villages in a block |
| **Block** | parent | state, district | Get state/district containing a block |
| **Village** | child | _(none)_ | _(Villages have no children)_ |
| **Village** | parent | state, district, block | Get all parents of a village |

---

## Advanced Features

### 1. **Hierarchy Traversal**
- ✅ Start from any level in the hierarchy
- ✅ Navigate up (parent) or down (child) 
- ✅ Automatic path following through all intermediate levels

### 2. **Target-Level Filtering**
- ✅ Return only specific location types
- ✅ Skip intermediate levels in results
- ✅ Multiple target types in single request

### 3. **Keyword Search**
- ✅ Case-insensitive partial matching
- ✅ Search across location names
- ✅ Combined with hierarchy and target filtering

### 4. **Data Integrity**
- ✅ Validates existence of starting location
- ✅ Respects hierarchy constraints
- ✅ Includes only active locations (is_active = 1)

---

## Performance Considerations

1. **Query Optimization**: Uses TypeORM query builder with proper indexing
2. **Memory Efficiency**: Streams results for large datasets
3. **Database Load**: Optimized queries with minimal joins
4. **Caching**: Consider Redis caching for frequently accessed hierarchies

---

## Security

1. **Input Validation**: All inputs are validated using class-validator
2. **SQL Injection**: Protected by TypeORM parameterized queries  
3. **Access Control**: Integrate with existing RBAC system as needed
4. **Rate Limiting**: Consider implementing rate limiting for production use

---

## Database Schema

The API assumes the following table structure (using existing tables):

```sql
-- State table
CREATE TABLE state (
  state_id INTEGER PRIMARY KEY,
  state_name VARCHAR(255) NOT NULL,
  state_code VARCHAR(10),
  is_found_in_census INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- District table  
CREATE TABLE district (
  district_id INTEGER PRIMARY KEY,
  district_name VARCHAR(255) NOT NULL,
  state_id INTEGER NOT NULL,
  district_code VARCHAR(10), 
  is_found_in_census INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (state_id) REFERENCES state(state_id)
);

-- Block table
CREATE TABLE block (
  block_id INTEGER PRIMARY KEY,
  block_name VARCHAR(255) NOT NULL,
  district_id INTEGER NOT NULL,
  block_code VARCHAR(10),
  is_found_in_census INTEGER DEFAULT 0, 
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES district(district_id)
);

-- Village table
CREATE TABLE village (
  village_id INTEGER PRIMARY KEY,
  village_name VARCHAR(255) NOT NULL,
  block_id INTEGER NOT NULL,
  village_code VARCHAR(10),
  is_found_in_census INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (block_id) REFERENCES block(block_id)
);
```

---

## Integration Examples

### JavaScript/TypeScript (Frontend)

```typescript
interface LocationSearchRequest {
  id: string;
  type: 'state' | 'district' | 'block' | 'village';
  direction: 'child' | 'parent';
  target?: ('state' | 'district' | 'block' | 'village')[];
  keyword?: string;
}

async function searchLocationHierarchy(params: LocationSearchRequest) {
  const response = await fetch('/location/hierarchy-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  });
  
  return await response.json();
}

// Usage
const villages = await searchLocationHierarchy({
  id: '27',
  type: 'state', 
  direction: 'child',
  target: ['village'],
  keyword: 'Naba'
});
```

### Python (Backend Integration)

```python
import requests

def search_location_hierarchy(base_url, search_params):
    url = f"{base_url}/location/hierarchy-search"
    response = requests.post(url, json=search_params)
    return response.json()

# Usage
result = search_location_hierarchy(
    "http://api.example.com", 
    {
        "id": "27",
        "type": "state",
        "direction": "child", 
        "target": ["village"],
        "keyword": "Naba"
    }
)
```

---

## Future Enhancements

1. **Caching**: Implement Redis caching for popular searches
2. **Pagination**: Add pagination support for large result sets  
3. **Fuzzy Search**: PostgreSQL `pg_trgm` extension for fuzzy matching
4. **Geospatial**: Add lat/lng coordinates and spatial queries
5. **Internationalization**: Multi-language location names
6. **Bulk Operations**: Support multiple location lookups in single request
7. **Performance Metrics**: Add query timing and performance monitoring
8. **GraphQL**: Alternative GraphQL endpoint for flexible queries

---

## Support

For questions or issues with the Location Hierarchy API:

1. Check this documentation for usage examples
2. Review error messages for validation guidance
3. Test with smaller datasets first
4. Contact the development team for complex use cases

---

*Last updated: $(date)*
*API Version: 1.0.0*