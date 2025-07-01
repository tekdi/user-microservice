# User Bulk Import Feature

This document describes how to use the bulk import feature to create multiple users and add them as cohort members with shortlisted status.

## Overview

The bulk import feature allows you to:
1. Create multiple users at once using a CSV or Excel file
2. Automatically add them as cohort members with shortlisted status
3. Skip reCAPTCHA verification for student accounts
4. Send verification notifications

## File Format

You can use either CSV or Excel (XLSX) format. The file should contain the following columns:

| Column Name | Description | Required | Format/Values |
|------------|-------------|----------|---------------|
| username | Unique username | Yes | String |
| firstName | First name | Yes | String |
| middleName | Middle name | No | String |
| lastName | Last name | Yes | String |
| email | Email address | Yes | Valid email |
| mobile | Mobile number | No | String |
| mobile_country_code | Country code | No | String (e.g., +91) |
| gender | Gender | No | male/female/transgender/non-binary/I do not want to disclose |
| dob | Date of birth | No | YYYY-MM-DD |
| country | Country | No | String |
| address | Address | No | String |
| district | District | No | String |
| state | State | No | String |
| pincode | PIN code | No | String |
| status | User status | No | active (default) |
| customFields | Custom fields | No | JSON array string |

## API Endpoint

```http
POST /users/bulk-import
Content-Type: multipart/form-data

Headers:
- academicyearid: UUID (required)
- tenantid: UUID (required)

Body:
- file: CSV/XLSX file
- cohortId: UUID
```

## Response Format

```json
{
  "totalProcessed": 10,
  "successCount": 8,
  "failureCount": 2,
  "failures": [
    {
      "row": 3,
      "error": "Email already exists"
    },
    {
      "row": 5,
      "error": "Invalid email format"
    }
  ]
}
```

## Sample Files

1. CSV Template: [Download](../templates/bulk-import-template.csv)
2. Excel Template: [Download](../templates/bulk-import-template.xlsx)

## Error Handling

Common errors and their solutions:

1. **Missing Required Fields**: Ensure all required fields (username, firstName, lastName, email) are provided
2. **Duplicate Username/Email**: Check if the username or email already exists
3. **Invalid Format**: Make sure the data follows the correct format (especially for dates and custom fields)
4. **File Size**: Keep the file size reasonable (recommended: less than 1000 users per import)

## Best Practices

1. **Test First**: Always test with a small batch of users before doing a large import
2. **Validate Data**: Clean and validate your data before importing
3. **Check Results**: Review the response to ensure all users were imported successfully
4. **Backup**: Keep a backup of your import file
5. **Timing**: Run large imports during off-peak hours

## Notes

1. All imported users will be assigned the student role automatically
2. Users will be added as cohort members with "shortlisted" status
3. Verification emails will be sent to users
4. The system will create entries in Elasticsearch for search functionality 