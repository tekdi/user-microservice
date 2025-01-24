## About
The User Service primarily focuses on user management. As a versatile service supporting multiple features, it incorporates the following key concepts:

## Tenant
A tenant is essentially a high-level grouping of users, similar to a domain. The service allows for creating, updating, and assigning tenants to users.

## Cohort
A cohort is a more granular grouping of users based on common attributes or features. You can create cohorts and assign users to them as needed.

## Roles
Roles are used by the application for various purposes, as the term suggests. Custom roles can be created, and these roles are specific to each tenant.

## Privileges
Privileges are used to implement Role-Based Access Control (RBAC). Custom privileges can be created based on specific requirements, and they are currently mapped to roles.

## Field
There are two types of fields: core/primary and custom. Core fields are directly stored in database columns, while custom fields are created and stored separately based on specific requirements.

For instance, in a Learning Management System (LMS), tenants can be defined as different programs. Cohorts would represent student classes or groups within a particular state. Roles could include Admin, Teacher, and Student. Privileges might encompass actions like creating or deleting users, as well as viewing or updating profiles. Core fields would consist of fundamental information such as username, email, and contact details. Custom fields could include attributes like gender, with a radio button type offering options like male or female.

Refer to the Documentation link for more details - https://tekdi.github.io/docs/user-service/about
