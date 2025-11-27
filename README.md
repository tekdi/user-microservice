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

## Testing (Jest)

## Testing (Jest)
...
<!-- npm ci
npm test
npm run test:watch
npm run test:cov
npm run test:e2e -->
...

The project is preconfigured with Jest for unit and e2e testing.

### Install

```bash
npm ci
```

### Run unit tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:cov
```

### Run e2e tests

```bash
npm run test:e2e
```

Notes:
- e2e tests run with `test/jest-e2e.json`.
- If an endpoint is guarded, tests should override or mock guards and external dependencies (like database or Kafka).
- Prefer supertest-based e2e tests for API validation:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
```

### e2e auth login for protected APIs

Provide credentials via environment variables before running e2e tests:

```bash
export E2E_USERNAME="your-username"
export E2E_PASSWORD="your-password"
# optional, if your APIs expect tenant header
export E2E_TENANT_ID="tenant-uuid"
npm run test:e2e
```

The helper at `test/e2e/utils/auth.helper.ts` logs in with `/auth/login` and uses the returned `access_token` in the `Authorization` header for subsequent requests (as required by `AuthController`). If no credentials are set, auth e2e tests are skipped automatically.
