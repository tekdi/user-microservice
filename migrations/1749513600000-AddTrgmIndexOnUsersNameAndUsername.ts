import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTrgmIndexOnUsersNameAndUsername1749513600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm extension (safe to run if already enabled)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // GIN trigram index on name — makes ILIKE '%term%' fast
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_name_trgm
      ON "Users" USING gin (name gin_trgm_ops)
    `);

    // GIN trigram index on username — makes ILIKE '%term%' fast
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username_trgm
      ON "Users" USING gin (username gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_username_trgm`);
  }
}
