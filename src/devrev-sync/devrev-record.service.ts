import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  DevRevApiError,
  DevRevClient,
  firstArray,
  idOf,
} from "./devrev.client";
import { DevRevSyncConfig } from "./devrev-sync.config";
import {
  DevRevLeafType,
  DevRevSync,
  DevRevSyncStatus,
} from "./entities/devrev-sync.entity";
import { FieldMap, payloadHash, toCustomFields } from "./learner-payloads";

export interface CustomObjectUpsert {
  leafType: DevRevLeafType;
  uniqueKey: string;
  /** Our key, stored in DevRevSync. */
  externalId: string;
  /** Custom field used to find the record after a unique_key conflict. */
  lookupField: string;
  lookupValue: string;
  title: string;
  fields: FieldMap;
  userId: string;
  cohortId?: string | null;
}

const TENANT_FRAGMENT = { tenant_fragment: true };

/**
 * Writes single DevRev records and keeps DevRevSync in step with them.
 * Every method is safe to repeat: creates carry a unique_key, Rev Users are
 * found by external_ref, and links are created at most once per record.
 */
@Injectable()
export class DevRevRecordService {
  constructor(
    private readonly client: DevRevClient,
    private readonly config: DevRevSyncConfig,
    @InjectRepository(DevRevSync)
    private readonly syncRepository: Repository<DevRevSync>
  ) {}

  /** Create or update one custom object; returns its DevRevSync row. */
  async upsertCustomObject(input: CustomObjectUpsert): Promise<DevRevSync> {
    const row = await this.findOrNewRow(
      input.leafType,
      input.externalId,
      input.userId,
      input.cohortId ?? null
    );
    row.uniqueKey = input.uniqueKey;

    const customFields = toCustomFields(input.fields);
    const hash = payloadHash({ title: input.title, customFields });
    if (this.isUnchanged(row, hash)) return row;

    return this.recording(row, hash, async () => {
      if (row.devrevId) {
        try {
          await this.client.post("custom-objects.update", {
            id: row.devrevId,
            title: input.title,
            custom_schema_spec: TENANT_FRAGMENT,
            custom_fields: customFields,
          });
          return row.devrevId;
        } catch (error) {
          // Deleted in DevRev by hand: forget the ID and create it again.
          if (!(error instanceof DevRevApiError) || error.status !== 404)
            throw error;
        }
      }

      try {
        const created = await this.client.post("custom-objects.create", {
          leaf_type: input.leafType,
          unique_key: input.uniqueKey,
          title: input.title,
          custom_schema_spec: TENANT_FRAGMENT,
          custom_fields: customFields,
        });
        return idOf(created);
      } catch (error) {
        if (!(error instanceof DevRevApiError) || !error.isConflict)
          throw error;
      }

      const existingId = await this.findCustomObjectId(
        input.leafType,
        input.lookupField,
        input.lookupValue
      );
      await this.client.post("custom-objects.update", {
        id: existingId,
        title: input.title,
        custom_schema_spec: TENANT_FRAGMENT,
        custom_fields: customFields,
      });
      return existingId;
    });
  }

  /**
   * Find the learner's Rev User by external_ref, creating it if missing and
   * updating name/email when they change. Returns its DevRevSync row.
   */
  async upsertRevUser(
    userId: string,
    body: Record<string, any>
  ): Promise<DevRevSync> {
    const row = await this.findOrNewRow(
      DevRevLeafType.REV_USER,
      userId,
      userId,
      null
    );
    const hash = payloadHash(body);
    if (this.isUnchanged(row, hash)) return row;

    return this.recording(row, hash, async () => {
      let id = row.devrevId;
      if (!id) {
        const list = await this.client.post("rev-users.list", {
          external_ref: [userId],
        });
        id = idOf(firstArray(list)[0]);
      }
      if (!id) {
        return idOf(await this.client.post("rev-users.create", body));
      }
      const update: Record<string, any> = {
        id,
        display_name: body.display_name,
      };
      if (body.email) update.email = body.email;
      await this.client.post("rev-users.update", update);
      return id;
    });
  }

  /**
   * Link a Rev User to a record (source = Rev User, target = record), once.
   * Links have no unique_key, so DevRevSync.linked is what stops duplicates.
   */
  async ensureLink(
    record: DevRevSync,
    revUserId: string | null,
    linkTypeId: string
  ): Promise<void> {
    // In dry-run no DevRev IDs are stored, so this returns before any call.
    if (record.linked || !revUserId || !record.devrevId || !linkTypeId) return;
    try {
      await this.client.post("links.create", {
        link_type: "custom_link",
        custom_link_type: linkTypeId,
        source: revUserId,
        target: record.devrevId,
      });
    } catch (error) {
      if (!(error instanceof DevRevApiError) || !error.isConflict) throw error;
    }
    record.linked = true;
    await this.syncRepository.save(record);
  }

  /** Mark these learners' records so the next sync re-sends them in full. */
  async markForResync(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await this.syncRepository.update(
      { userId: In(userIds) },
      { payloadHash: null, status: DevRevSyncStatus.PENDING }
    );
    return result.affected ?? 0;
  }

  private async findCustomObjectId(
    leafType: string,
    field: string,
    value: string
  ): Promise<string> {
    const list = await this.client.post("custom-objects.list", {
      leaf_type: leafType,
      filter: ["eq", `$custom_fields.tnt__${field}`, value],
    });
    const id = idOf(firstArray(list)[0]);
    if (!id) {
      throw new DevRevApiError(
        `${leafType}: unique_key exists but no record has ${field}=${value}`,
        "custom-objects.list",
        null,
        false,
        null,
        null,
        null
      );
    }
    return id;
  }

  private async findOrNewRow(
    leafType: DevRevLeafType,
    externalId: string,
    userId: string,
    cohortId: string | null
  ): Promise<DevRevSync> {
    const existing = await this.syncRepository.findOne({
      where: { leafType, externalId },
    });
    if (existing) {
      existing.cohortId = cohortId ?? existing.cohortId;
      return existing;
    }
    return this.syncRepository.create({
      leafType,
      externalId,
      userId,
      cohortId,
      status: DevRevSyncStatus.PENDING,
      attempts: 0,
      linked: false,
    });
  }

  private isUnchanged(row: DevRevSync, hash: string): boolean {
    return (
      !this.config.dryRun &&
      !!row.devrevId &&
      row.payloadHash === hash &&
      row.status === DevRevSyncStatus.SYNCED
    );
  }

  /**
   * Runs one write and records the outcome on the row. In dry-run mode the
   * fake ID is not stored, so a later real run creates the record properly.
   */
  private async recording(
    row: DevRevSync,
    hash: string,
    write: () => Promise<string | undefined>
  ): Promise<DevRevSync> {
    try {
      const id = await write();
      if (this.config.dryRun) {
        row.status = DevRevSyncStatus.DRY_RUN;
      } else {
        if (!id)
          throw new Error(
            `DevRev returned no id for ${row.leafType} ${row.externalId}`
          );
        row.devrevId = id;
        row.payloadHash = hash;
        row.status = DevRevSyncStatus.SYNCED;
        row.lastSyncedAt = new Date();
      }
      row.attempts = 0;
      row.lastError = null;
      return await this.syncRepository.save(row);
    } catch (error) {
      row.status = DevRevSyncStatus.FAILED;
      row.attempts = (row.attempts ?? 0) + 1;
      row.lastError =
        (error as Error).message?.slice(0, 2000) ?? "unknown error";
      await this.syncRepository.save(row);
      throw error;
    }
  }
}
