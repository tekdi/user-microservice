/**
 * For a given list of userIds (one per line), fetch ALL their CohortMembers rows
 * (any status) so we can see why they ended up with multiple active cohorts.
 *
 * Usage:
 *   node scripts/fetch-multi-cohort-details.js <input-userid-list.txt> <output-csv>
 *
 * Output CSV columns: userId,cohortId,status,statusReason
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/fetch-multi-cohort-details.js <input-userid-list.txt> <output-csv>');
    process.exit(1);
  }
  return { inputPath, outputPath };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { inputPath, outputPath } = parseArgs();
  const userIds = fs
    .readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(`Loaded ${userIds.length} user IDs from ${inputPath}`);

  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
  });
  await client.connect();

  const res = await client.query(
    `SELECT "userId", "cohortId", "status", "statusReason"
     FROM "CohortMembers"
     WHERE "userId" = ANY($1::uuid[])
     ORDER BY "userId", "status"`,
    [userIds]
  );
  await client.end();

  const outStream = fs.createWriteStream(outputPath);
  outStream.write('userId,cohortId,status,statusReason\n');
  for (const row of res.rows) {
    outStream.write(
      [row.userId, row.cohortId, row.status, row.statusReason].map(csvEscape).join(',') + '\n'
    );
  }
  outStream.end();

  console.log(`Total rows written: ${res.rows.length}`);
  console.log(`Output written to: ${path.resolve(outputPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
