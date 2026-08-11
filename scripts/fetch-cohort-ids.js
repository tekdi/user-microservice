/**
 * Fetch active CohortMembers.cohortId for every userId listed in the survey CSV.
 *
 * Usage:
 *   node scripts/fetch-cohort-ids.js <input-csv> <output-csv>
 *
 * Input CSV must have a header "contextId" (or pass --column=someOtherHeader)
 * with one user UUID per row.
 *
 * Reads DB connection info from process.env (same vars used by the app / .env):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USERNAME, POSTGRES_PASSWORD
 *
 * Output CSV columns: userId,cohortId,cohortMembershipId,status,cohortAcademicYearId,createdAt,updatedAt
 * A user with multiple active cohort memberships will appear on multiple rows.
 * A user with no active cohort membership appears once with empty cohort columns.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const BATCH_SIZE = 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const column = (args.find((a) => a.startsWith('--column=')) || '--column=contextId').split('=')[1];
  const [inputPath, outputPath] = positional;
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/fetch-cohort-ids.js <input-csv> <output-csv> [--column=contextId]');
    process.exit(1);
  }
  return { inputPath, outputPath, column };
}

function readUserIds(inputPath, column) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const colIndex = header.indexOf(column);
  if (colIndex === -1) {
    throw new Error(`Column "${column}" not found in CSV header: ${header.join(', ')}`);
  }
  const ids = lines.slice(1).map((line) => line.split(',')[colIndex].trim().replace(/^"|"$/g, ''));
  return [...new Set(ids.filter(Boolean))];
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { inputPath, outputPath, column } = parseArgs();
  const userIds = readUserIds(inputPath, column);
  console.log(`Loaded ${userIds.length} unique user IDs from ${inputPath}`);

  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
  });
  await client.connect();

  const outStream = fs.createWriteStream(outputPath);
  outStream.write('userId,cohortId,cohortMembershipId,status,cohortAcademicYearId,createdAt,updatedAt\n');

  const found = new Set();
  let totalRows = 0;
  let multiActiveUsers = 0;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const res = await client.query(
      `SELECT "userId", "cohortId", "cohortMembershipId", "status", "cohortAcademicYearId", "createdAt", "updatedAt"
       FROM "CohortMembers"
       WHERE "userId" = ANY($1::uuid[]) AND "status" = 'active'`,
      [batch]
    );

    const byUser = new Map();
    for (const row of res.rows) {
      found.add(row.userId);
      totalRows += 1;
      outStream.write(
        [row.userId, row.cohortId, row.cohortMembershipId, row.status, row.cohortAcademicYearId, row.createdAt, row.updatedAt]
          .map(csvEscape)
          .join(',') + '\n'
      );
      byUser.set(row.userId, (byUser.get(row.userId) || 0) + 1);
    }
    for (const count of byUser.values()) {
      if (count > 1) multiActiveUsers += 1;
    }

    console.log(`Batch ${i / BATCH_SIZE + 1}: processed ${batch.length} users, ${res.rows.length} active rows found`);
  }

  const missing = userIds.filter((id) => !found.has(id));
  for (const id of missing) {
    outStream.write([id, '', '', '', '', '', ''].map(csvEscape).join(',') + '\n');
  }

  outStream.end();
  await client.end();

  console.log('---');
  console.log(`Total users in input: ${userIds.length}`);
  console.log(`Users with at least one active cohort membership: ${found.size}`);
  console.log(`Users with NO active cohort membership: ${missing.length}`);
  console.log(`Users with MORE THAN ONE active cohort membership: ${multiActiveUsers}`);
  console.log(`Total active-membership rows written: ${totalRows}`);
  console.log(`Output written to: ${path.resolve(outputPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
