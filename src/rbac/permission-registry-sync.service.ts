import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Privilege } from "./privilege/entities/privilege.entity";
import { PERMISSIONS } from "src/common/decorators/permission.config";

/**
 * On startup, diffs the static PERMISSIONS registry (src/common/decorators/permission.config.ts)
 * against the Privileges table and inserts any codes that don't exist yet.
 * Never deletes or renames existing rows — a code still referenced by
 * RolePrivilegesMapping would break that role if silently removed. Orphaned
 * DB rows with no matching PERMISSIONS entry are only logged, for manual review.
 */
@Injectable()
export class PermissionRegistrySyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionRegistrySyncService.name);

  constructor(
    @InjectRepository(Privilege)
    private readonly privilegeRepository: Repository<Privilege>
  ) {}

  async onModuleInit() {
    try {
      await this.sync();
    } catch (error) {
      this.logger.error(`Permission registry sync failed: ${error.message}`);
    }
  }

  async sync() {
    const registryCodes = Object.values(PERMISSIONS) as string[];
    const existing = await this.privilegeRepository.find({
      select: ["code"],
    });
    const existingCodes = new Set(existing.map((p) => p.code));

    const missing = registryCodes.filter((code) => !existingCodes.has(code));
    if (missing.length) {
      const rows = missing.map((code) => {
        const [modulePrefix, action] = code.split(".");
        return {
          title: code,
          code,
          module: modulePrefix
            ? modulePrefix.charAt(0).toUpperCase() + modulePrefix.slice(1)
            : null,
          action: action || null,
          isVisibleInUI: true,
          createdBy: "system",
          updatedBy: "system",
        } as Partial<Privilege>;
      });

      // Single batch upsert keyed on the unique `code` column — safe under
      // concurrent startups (multiple replicas racing this same diff) since
      // conflicting rows are skipped at the DB level instead of duplicated.
      await this.privilegeRepository.upsert(rows, {
        conflictPaths: ["code"],
        skipUpdateIfNoValuesChanged: true,
      });

      this.logger.log(
        `Permission registry sync: inserted ${missing.length} new privilege(s): ${missing.join(", ")}`
      );
    }

    const orphaned = [...existingCodes].filter(
      (code) => !registryCodes.includes(code)
    );
    if (orphaned.length) {
      this.logger.warn(
        `Permission registry sync: ${orphaned.length} privilege code(s) in DB have no matching entry in PERMISSIONS config (left untouched): ${orphaned.join(", ")}`
      );
    }
  }
}
