## 📘 Custom Field & Form Library - Database Schema Documentation

---

### 📋 `#__fields`

Stores field information with the field type and other extra information

| Column             | Type                          | Description                               |
| ------------------ | ----------------------------- | ----------------------------------------- |
| `fieldId`          | uuid (PK)                     | Primary key, unique field identifier      |
| `context`          | character varying             | Context of the field usage                |
| `name`             | character varying             | Field machine-readable name               |
| `label`            | character varying             | Field display label                       |
| `defaultValue`     | character varying             | Default value for the field               |
| `type`             | character varying             | Field type (text, number, dropdown, etc.) |
| `description`      | text                          | Field description                         |
| `state`            | text                          | Field state information                   |
| `required`         | boolean                       | Whether the field is mandatory            |
| `ordering`         | integer                       | Field ordering in form                    |
| `onlyUseInSubform` | boolean                       | If true, only used in subforms            |
| `tenantId`         | uuid (FK)                     | Associated tenant                         |
| `contextId`        | uuid                          | Associated context ID                     |
| `contextType`      | character varying             | Type of context (e.g., 'user')            |
| `fieldParams`      | jsonb                         | Parameters for field rendering            |
| `assetId`          | character varying             | Associated asset ID                       |
| `note`             | character varying             | Additional notes                          |
| `metadata`         | character varying             | Metadata for field                        |
| `access`           | character varying             | Access control details                    |
| `render`           | character varying             | Render control settings                   |
| `fieldAttributes`  | json                          | Additional field attributes               |
| `sourceDetails`    | jsonb                         | Field source details (e.g., API, static)  |
| `dependsOn`        | character varying             | Field dependency on other fields          |
| `maxLength`        | bigint                        | Maximum character length                  |
| `minLength`        | bigint                        | Minimum character length                  |
| `createdAt`        | timestamp with time zone      | Record creation timestamp                 |
| `updatedAt`        | timestamp with time zone      | Record update timestamp                   |
| `createdBy`        | uuid                          | Created by user ID                        |
| `updatedBy`        | uuid                          | Updated by user ID                        |

---

### 📋 `#__fieldValues`

Stores actual submitted values for different fields against specific entities.

| Column             | Type                    | Description                                             |
| ------------------ | ----------------------- | ------------------------------------------------------- |
| `fieldValuesId`    | uuid (PK)               | Primary key, unique field value identifier              |
| `fieldId`          | uuid (FK)               | Reference to the field definition                       |
| `itemId`           | uuid                    | ID of the associated entity (user, event, etc.)         |
| `textValue`        | text                    | Free-form user input of text                            |
| `numberValue`      | numeric                 | Allows both integer and decimal values, precision-safe  |
| `dateValue`        | date                    | Native PostgreSQL date format                           |
| `dropdownValue`    | character varying       | Stores selected option text or code                     |
| `radioValue`       | character varying       | Similar to dropdown, stores one selected value          |
| `checkboxValue`    | boolean                 | Stores true/false only                                  |
| `textareaValue`    | text                    | Longer free-form text                                   |
| `fileValue`        | character varying       | File path or reference to file ID                       |
| `multiselectValue` | jsonb                   | Stores array of selected values (typed or coded)        |
| `createdAt`        | timestamp with time zone| Record creation timestamp                               |
| `updatedAt`        | timestamp with time zone| Record update timestamp                                 |
| `createdBy`        | uuid                    | Created by user ID                                      |
| `updatedBy`        | uuid                    | Updated by user ID                                      |

---

### 📋 `#__forms`

Stores form structures with metadata.

| Column             | Type                     | Description                           |
| ------------------ | ------------------------ | --------------------------------------|
| `formid`           | uuid (PK)                | Primary key, unique form identifier   |
| `title`            | character varying(255)   | Title of the form                     |
| `context`          | character varying(255)   | Context information                   |
| `contextType`      | character varying(50)    | Context type (e.g., 'user', 'event')  |
| `fields`           | jsonb                    | JSON structure of field references    |
| `tenantId`         | uuid (FK)                | Associated tenant                     |
| `createdat`        | timestamp with time zone | Record creation timestamp             |
| `updatedat`        | timestamp with time zone | Record update timestamp               |
| `createdBy`        | uuid                     | Created by user ID                    |
| `updatedBy`        | uuid                     | Updated by user ID                    |

---

### 📋 `#__formSubmissions`

Stores form-level submission status for a given item (e.g., user, cohort, event).


| Column         | Type                     | Description                                         |
|----------------|------------------------- |-----------------------------------------------------|
| `submissionId` | uuid (PK)                | Unique submission ID                                |
| `formId`       | uuid (FK)                | Form that was submitted                             |
| `itemId`       | uuid                     | The item (user, event, cohort) the form belongs to  |
| `status`       | integer                  | 0 = draft, 1 = final submit                         |
| `createdBy`    | uuid                     | ID of creator                                       |
| `updatedBy`    | uuid                     | ID of updater                                       |
| `createdAt`    | timestamp with time zone | Timestamp of creation                               |
| `updatedAt`    | timestamp with time zone | Timestamp of update                                 |