
## 📝 Product Requirements Document (PRD) - Custom Field & Form Library

---

### 📌 Overview
The Custom Field & Form Library enables services to define, render, and manage dynamic forms and custom fields without the need for database schema changes. It provides a reusable and scalable foundation for capturing structured data across different services such as users, cohorts, events, and more.
Field values are saved across multiple columns (e.g., textValue, numberValue, dateValue) to improve query performance, enhance validation, and support better reporting.

---

### 🎯 Objectives
- Allow creation and configuration of form structures consisting of various field types.
- Enable runtime attachment of forms to any service entity (e.g., user, event, cohort) using itemId and contextType.
- Store and retrieve field values submitted via forms across type-specific columns.
- Support integration across services through APIs or npm package.
- Ensure flexibility for frontend rendering and validation via JSON-driven form definitions.
- Enable dynamic visibility of fields using conditional field support based on user input.

---

### ✅ Features
- Define fields with type, label, validation rules, options, visibility, and conditional logic.
- Compose forms with ordering, grouping, and logic using JSON structures.
- Store submitted field values across multiple typed columns for filtering and reporting.
- APIs to: Fetch forms by entity type, Submit field values, Retrieve submitted values
- Support multiple entity types using itemId and contextType.
- Dynamic configuration with no need for DB schema migration.
- Reusable across all services with minimal setup.
- Designed for integration with role and permission systems.

---

### 📋 Supported Field Types
- text
- number
- date
- dropdown
- radio
- checkbox
- textarea
- file
- multiselect

---

### 🔁 Conditional Field Support

Fields can dynamically appear based on the value of another field.  
This logic is defined inside the fieldAttributes JSONB column in the Fields table.

| fieldAttributes Key | Type             | Description                                                        |
|---------------------|------------------|--------------------------------------------------------------------|
| dependsOn           | string           | Field key that this field depends on                               |
| dependsValue        | string / array   | Value(s) in the parent field that trigger this field to be shown   |

📘 Example with 3 fields (stored separately in Fields table):

These are three different rows in the Fields table, each with its own fieldAttributes JSON:

—

🔹 Field 1 → userType (no condition, just a select input)

```json
{
  "label": "User Type",
  "type": "select",
  "options": [
    { "label": "Student", "value": "student" },
    { "label": "Professional", "value": "professional" }
  ]
}
```

🔹 Field 2 → schoolName (shown only if userType = student)

```json
{
  "label": "School Name",
  "placeholder": "Enter school name",
  "dependsOn": "userType",
  "dependsValue": ["student"]
}
```

🔹 Field 3 → companyName (shown only if userType = professional)

```json
{
  "label": "Company Name",
  "placeholder": "Enter company name",
  "dependsOn": "userType",
  "dependsValue": ["professional"]
}
```

Each of these field definitions is stored as a separate row in the Fields table, with logic embedded inside its respective fieldAttributes column. This approach avoids schema changes and keeps field logic modular and reusable.

---

### 🧹 Entities

#### 1. Form
- id, name, description, isEnabled, formType, formJson
- JSON to include field grouping and ordering references

#### 2. Field
- id, name, label, type, validation rules, required
- fieldAttributes (jsonb): contains UI configuration, options, and conditional logic

#### 3. Field Value
- id, fieldId, itemId (userId, cohortId, eventId, etc.), contextType (e.g., 'user', 'event'),
- textValue, numberValue, dateValue, dropdownValue, etc., createdBy, createdAt

#### 4. Form Submission
- submissionId (UUID)
- formId (UUID)
- itemId (UUID)
- status (integer): 0 = Draft, 1 = Final Submit
- createdAt, updatedAt, createdBy, updatedBy

---

### 📤 Form Submission Status Support

To track whether a form is saved as a draft or submitted finally, a new table `FormSubmissions` is introduced.

Each form submitted by an item (user, cohort, event, etc.) will have one row in this table, storing the current status:

| status | Meaning        |
|--------|----------------|
| 0      | Draft          |
| 1      | Final Submit   |

💡 This enables features such as:
- Tracking incomplete/draft submissions
- Allowing resumption of saved forms
- Reporting how many users completed a form

Each submission is associated with a `formId`, `itemId`, and a `status`.

---

### 👥 Assumptions

- itemId will be globally unique for each record (userId, eventId etc.)
- contextType is passed to identify the owning service context
- Permissions will be handled at the API layer or middleware
- No hardcoded logic in consuming services — forms are dynamic

---

### 📁 Data Models
Refer to [Custom Field and Form Table Schema Documentation](./db-design.md) for detailed entity structure.