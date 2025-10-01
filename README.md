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

## Keycloak Configuration for Magic Link 
1.Pre-Setup: Enable Token Exchange Feature in Keycloak
When starting Keycloak (Docker), set the feature flags:

environment:
  - KC_FEATURES=token-exchange,admin-fine-grained-authz

Restart Keycloak to apply.
 Without this, the Token Exchange and fine-grained permissions options will not show up in the Admin Console.

2.Service Account Roles Required for shiksha
Assign these roles to the shiksha service account (Clients → shiksha → Service Account Roles):
a.realm-management/impersonation
Needed to impersonate users during token exchange.
Required for exchangeTokenForUser() flows.
b.realm-management/view-users
Needed to validate user existence and fetch details.
c.realm-management/manage-users
Needed for user-related operations during token exchange.
d.offline_access
Needed so the magic link flow can return refresh tokens as well as access tokens.

3.Steps for Enabling Fine-Grained Token Exchange for shiksha
a. Log in to Keycloak Admin Console
Select the realm where shiksha exists.

b. Enable Fine-Grained Permissions for shiksha
Go to Clients → shiksha → Permissions.
Toggle “Permissions Enabled” → ON.

c. Configure Token-Exchange Permission
Under shiksha → Permissions, you will now see:
View
Manage
Configure
Token Exchange ✅
Click Token Exchange to open its configuration.

d. Create a Policy for Token Exchange
Go to Authorization → Policies → Create Policy → Client.
Name it: allow-shiksha-token-exchange.
Select client: shiksha.
Save.

e. Assign Policy to Token Exchange Permission
Go back to Permissions → Token Exchange.
In the Policies section → click Add Policy.
Select the policy allow-shiksha-token-exchange.
Save.



