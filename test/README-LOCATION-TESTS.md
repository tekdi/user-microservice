# Location Module Test Suite Documentation

## Overview

This comprehensive test suite covers the Location Module's hierarchy search functionality with end-to-end, unit, and performance tests.

## Test Files Structure

```
test/
├── location.e2e-spec.ts          # End-to-end integration tests
├── location-unit.spec.ts         # Unit tests for service methods (legacy)
├── location-refactored.spec.ts   # Unit tests for refactored service
├── location-performance.spec.ts   # Performance and stress tests
├── jest-e2e.json                 # E2E test configuration
├── setup-e2e.ts                  # Test environment setup
└── README-LOCATION-TESTS.md       # This documentation
```

## Test Coverage

### 1. End-to-End Tests (`location.e2e-spec.ts`)

**Child Direction Tests:**
- ✅ Get all districts under a state
- ✅ Get districts with keyword filter  
- ✅ Get all blocks under a district
- ✅ Get all villages under a block
- ✅ Get multiple target types from state
- ✅ Get all children when no target specified
- ✅ Return empty array for village children

**Parent Direction Tests:**
- ✅ Get all parents from village
- ✅ Get specific parent types from village
- ✅ Get parents from block
- ✅ Get parents from district
- ✅ Return empty array for state parents

**Keyword Search Tests:**
- ✅ Filter results by keyword (case-insensitive)
- ✅ Return empty array when keyword matches nothing
- ✅ Handle partial keyword matches

**Response Structure Tests:**
- ✅ Return correct response structure
- ✅ Include state_code for state entities

**Performance Tests:**
- ✅ Complete targeted search quickly (< 2 seconds)
- ✅ Handle large result sets efficiently (< 5 seconds)

**Error Handling Tests:**
- ✅ Return 400 for missing required fields
- ✅ Return 400 for invalid type
- ✅ Return 400 for invalid direction
- ✅ Return 400 for non-existent location ID
- ✅ Return 400 for invalid target types
- ✅ Return 400 for invalid numeric ID
- ✅ Handle empty target array
- ✅ Handle whitespace-only keyword

**Edge Cases Tests:**
- ✅ Handle very long keywords gracefully
- ✅ Handle special characters in keyword
- ✅ Handle maximum target array

**Legacy Endpoints Tests:**
- ✅ Support legacy search endpoint
- ✅ Support legacy GET endpoint

### 2. Unit Tests (`location-unit.spec.ts` - Legacy)

**Service Method Tests:**
- ✅ Fetch only districts when target is district
- ✅ Fetch only villages with keyword filter
- ✅ Handle multiple target types
- ✅ Fetch all parents from village
- ✅ Fetch specific parent types only

**Validation Tests:**
- ✅ Throw BadRequestException for non-existent entity
- ✅ Throw BadRequestException for invalid target types
- ✅ Validate numeric ID format

**Query Optimization Tests:**
- ✅ Use parameterized queries to prevent SQL injection
- ✅ Skip unnecessary queries when targets are specified
- ✅ Handle empty keyword gracefully

**Response Format Tests:**
- ✅ Return correct response structure
- ✅ Handle empty results correctly

**Edge Cases:**
- ✅ Handle village with no children
- ✅ Handle state with no parents
- ✅ Handle database connection errors gracefully

**Helper Methods:**
- ✅ entityExists method
- ✅ getValidTargets method

### 2.1. Refactored Unit Tests (`location-refactored.spec.ts`)

**Configuration-Driven Architecture:**
- ✅ Use configuration for all location types
- ✅ Handle all types with same logic pattern
- ✅ Consistent configuration structure validation

**Smart Query Optimization:**
- ✅ Direct queries for immediate children
- ✅ JOIN queries for multi-level relationships
- ✅ Query strategy selection validation

**Functional Programming Benefits:**
- ✅ Multiple targets with single method
- ✅ Functional keyword filtering composition
- ✅ Pure function testing

**Performance Characteristics:**
- ✅ Minimize database calls
- ✅ Parameterized query security
- ✅ Concurrent request handling

**Architecture Quality:**
- ✅ Configuration consistency
- ✅ Functional programming principles
- ✅ Code quality metrics validation

### 3. Performance Tests (`location-performance.spec.ts`)

**Optimized Query Performance:**
- ✅ Complete targeted district search in < 1 second
- ✅ Complete keyword search efficiently (< 2 seconds)
- ✅ Complete parent search very quickly (< 0.5 seconds)
- ✅ Handle large village dataset efficiently (< 3 seconds)

**Query Efficiency Tests:**
- ✅ Not fetch unnecessary data when target is specified
- ✅ Efficiently filter with keyword at SQL level

**Concurrent Request Handling:**
- ✅ Handle multiple concurrent requests efficiently

**Memory Usage Tests:**
- ✅ Not cause memory leaks with large result sets

**Database Connection Efficiency:**
- ✅ Reuse database connections efficiently

**Stress Tests:**
- ✅ Handle complex multi-level searches efficiently
- ✅ Maintain performance with long keywords

## Running the Tests

### Prerequisites

1. **Database Setup**: Ensure your test database is running and accessible
2. **Environment Variables**: Set up test database connection
3. **Dependencies**: Install required packages

```bash
npm install --save-dev jest @nestjs/testing supertest ts-jest
```

### Individual Test Commands

```bash
# Run unit tests only
npm run test:location:unit

# Run E2E tests only  
npm run test:location:e2e

# Run performance tests only
npm run test:location:performance

# Run all location tests
npm run test:location:all

# Run with coverage report
npm run test:location:coverage

# Run in watch mode
npm run test:location:watch
```

### Full Test Suite

```bash
# Run all tests (unit + e2e)
npm run test:full
```

## Test Data Setup

The tests automatically create and clean up test data:

- **State**: 1 test state (ID: 27, Name: "West Bengal")
- **District**: 1 test district (ID: 421, Name: "Nandurbar") 
- **Block**: 1 test block (ID: 5001, Name: "Akkalkuwa")
- **Village**: 1 test village (ID: 90001, Name: "Nandurbar Village")

**Performance Tests** create larger datasets:
- 1 state, 10 districts, 50 blocks, 500 villages

## Performance Thresholds

| Test Type | Threshold | Description |
|-----------|-----------|-------------|
| Targeted Search | 1 second | Single table queries with filters |
| Keyword Search | 2 seconds | Text search with LIKE operations |
| Parent Search | 0.5 seconds | JOIN queries for parent hierarchy |
| Large Dataset | 3 seconds | Queries returning 100+ results |

## Expected Results

### Before Optimization
- State → Districts: **33+ seconds**
- Complex searches: **45+ seconds**
- Memory usage: **High**

### After Optimization  
- State → Districts: **< 1 second** (97% improvement)
- Complex searches: **< 3 seconds** (93% improvement)
- Memory usage: **Optimized**

## Test Environment Configuration

### Jest Configuration (`jest-e2e.json`)
```json
{
  "testTimeout": 30000,
  "maxWorkers": 1,
  "setupFilesAfterEnv": ["<rootDir>/test/setup-e2e.ts"]
}
```

### Custom Matchers
- `toBeWithinRange(floor, ceiling)`: Check if value is within range
- `toHavePerformanceUnder(threshold)`: Check performance thresholds

## Debugging Tests

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Check database is running
   npm run test:location:unit  # Try unit tests first
   ```

2. **Performance Test Failures**
   ```bash
   # Run with verbose output
   npm run test:location:performance -- --verbose
   ```

3. **Test Data Conflicts**
   ```bash
   # Clean up manually if needed
   DELETE FROM village WHERE village_id BETWEEN 1 AND 90001;
   DELETE FROM block WHERE block_id BETWEEN 1 AND 5001;
   DELETE FROM district WHERE district_id BETWEEN 1 AND 421;
   DELETE FROM state WHERE state_id IN (1, 27);
   ```

### Logging

Tests include performance logging:
```
Targeted district search completed in 45.23ms
Keyword search completed in 123.45ms  
Large village dataset search completed in 1234.56ms (500 results)
```

## Continuous Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Location Tests
  run: |
    npm run test:location:unit
    npm run test:location:e2e
    npm run test:location:performance
```

## Coverage Reports

Generate detailed coverage reports:

```bash
npm run test:location:coverage
```

Coverage should be:
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

## Contributing

When adding new features to the Location Module:

1. **Add Unit Tests**: Test individual methods
2. **Add E2E Tests**: Test complete user workflows  
3. **Add Performance Tests**: Ensure optimizations work
4. **Update Documentation**: Keep this README current

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Data Cleanup**: Always clean up test data
3. **Performance Monitoring**: Track query execution times
4. **Error Coverage**: Test all error scenarios
5. **Edge Cases**: Test boundary conditions

## Support

For questions about the test suite:

1. Check test output for specific error messages
2. Review database logs for connection issues
3. Verify test data setup completed successfully
4. Contact the development team for complex issues