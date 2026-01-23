# Cohort Academic Year Module

## Module Overview

The Cohort Academic Year module manages the relationship between cohorts and academic years. It handles assignment of cohorts to academic years and retrieval of cohort-academic year associations.

**Purpose**: Manage cohort-academic year associations for organizing cohorts within specific academic periods.

**Key Entities**:
- `CohortAcademicYear` - Maps cohorts to academic years

**Dependencies**:
- `CohortModule` - For cohort validation
- `AcademicyearsModule` - For academic year validation

## API Endpoints

### Add Cohort to Academic Year - POST `/create`

**API ID**: `api.create.cohortAcademicYear`

**Route**: `POST /user/v1/cohortAcademicYear/create`

**Authentication**: Required

**Request Body**: Cohort ID, Academic Year ID

**Response**: Cohort-academic year association created successfully

**Business Logic**: Creates relationship between cohort and academic year.

## Common Issues & Solutions

### Issue: Cohort not appearing in academic year
**Solution**: Verify cohort-academic year mapping exists. Check academic year ID matches.

### Common Mistakes to Avoid
1. Not validating cohort and academic year existence
2. Creating duplicate mappings
