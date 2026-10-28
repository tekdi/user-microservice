import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLowerUsernameIndexOnUsers1761600000000
  implements MigrationInterface
{
  // CREATE INDEX CONCURRENTLY cannot run inside a transaction
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Serves LOWER(username) LIKE 'prefix%' (suggestUsername) as a btree range scan
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_lower_prefix
      ON "Users" (LOWER(username) text_pattern_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_users_username_lower_prefix`
    );
  }
}
