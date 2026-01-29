# Automatic Member Module

## Module Overview

The Automatic Member module handles automatic assignment of users to cohorts based on custom field values. It evaluates field conditions and automatically assigns users to appropriate cohorts.

**Purpose**: Automatically assign users to cohorts based on custom field criteria without manual intervention.

**Key Entities**:
- `AutomaticMember` - Stores automatic member assignment rules

**Dependencies**:
- `UserModule` - For user management
- `CohortModule` - For cohort management
- `FieldsModule` - For custom field evaluation

## API Endpoints

### Automatic Member Assignment

The automatic member functionality is primarily used internally when creating users with `automaticMember` flag set to true. It evaluates custom field values and assigns users to cohorts automatically.

**Business Logic**:
1. Evaluates custom field values against cohort criteria
2. Matches users to cohorts based on field conditions
3. Automatically creates cohort member assignments
4. Handles updates when field values change

## Common Issues & Solutions

### Issue: Users not automatically assigned to cohorts
**Solution**: Verify custom field values match cohort criteria. Check automatic member rules are configured correctly.

### Common Mistakes to Avoid
1. Not providing correct field values for evaluation
2. Missing automatic member configuration
