# Cron Module

## Module Overview

The Cron module manages scheduled tasks and background jobs. It handles periodic operations like automatic member assignments, data synchronization, and maintenance tasks.

**Purpose**: Execute scheduled tasks and background jobs at specified intervals.

**Key Entities**: None (stateless scheduled tasks)

**Dependencies**:
- `AutomaticMemberModule` - For automatic member assignments
- `UserModule` - For user operations
- `CohortModule` - For cohort operations

## API Endpoints

### Cron Jobs

Cron jobs are scheduled tasks that run automatically. The main cron job documented is:

#### Navapatham Assign - Scheduled Task

**API ID**: `api.cron.navapatham.assign`

**Schedule**: Runs on configured schedule (see `NAVAPATHAM_CRON_DOCUMENTATION.md`)

**Purpose**: Automatically assign users to cohorts based on Navapatham criteria

**Business Logic**:
1. Queries users matching Navapatham criteria
2. Evaluates automatic member rules
3. Assigns users to appropriate cohorts
4. Logs assignment results

## Common Issues & Solutions

### Issue: Cron job not running
**Solution**: Check cron schedule configuration, server time, and cron service status. Verify job is enabled.

### Issue: Automatic assignments not happening
**Solution**: Verify automatic member rules are configured correctly. Check user criteria match rules.

### Common Mistakes to Avoid
1. Not configuring cron schedule correctly
2. Missing error handling in cron jobs
3. Not logging cron job execution
