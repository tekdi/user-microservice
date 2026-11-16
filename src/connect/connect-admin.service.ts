import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  EntityTarget,
  In,
  Repository,
} from "typeorm";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { CacheService } from "src/cache/cache.service";
import { ConnectCareerDomain } from "./entities/connect-career-domain.entity";
import { ConnectCareerDomainGroup } from "./entities/connect-career-domain-group.entity";
import { SupportOfferingType } from "./entities/support-offering-type.entity";
import {
  CONNECT_CACHE,
  CONNECT_ERRORS,
  toConnectKey,
} from "./constants/connect.constants";
import { ConnectService } from "./connect.service";
import {
  ListMasterQueryDto,
  SaveCareerDomainGroupsDto,
  SaveCareerDomainsDto,
  SaveSupportOfferingsDto,
  UpdateCareerDomainDto,
  UpdateCareerDomainGroupDto,
  UpdateSupportOfferingDto,
} from "./dto/admin-master.dto";

type MasterEntity =
  | ConnectCareerDomainGroup
  | ConnectCareerDomain
  | SupportOfferingType;

/**
 * Admin APIs for the Connect master lists (career domain groups, career
 * domains, "Open to" options). Callers are checked by ConnectAdminGuard.
 * Save = bulk create-or-update by key, so the same payload can be sent
 * again whenever the list changes. Nothing is deleted: isActive=false hides
 * an item from the pickers but keeps it on existing profiles.
 */
@Injectable()
export class ConnectAdminService {
  constructor(
    @InjectRepository(ConnectCareerDomain)
    private readonly careerDomainRepository: Repository<ConnectCareerDomain>,
    @InjectRepository(ConnectCareerDomainGroup)
    private readonly groupRepository: Repository<ConnectCareerDomainGroup>,
    @InjectRepository(SupportOfferingType)
    private readonly supportOfferingRepository: Repository<SupportOfferingType>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly connectService: ConnectService
  ) {}

  // ---------------------------------------------------------------------
  // Career domain groups
  // ---------------------------------------------------------------------

  async listCareerDomainGroups(query: ListMasterQueryDto, response: Response) {
    const apiId = APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_LIST;
    try {
      const items = await this.dataSource.query(
        `SELECT g.*,
                (SELECT count(*)::int FROM connect_career_domains d
                  WHERE d."groupId" = g."id") AS "domainCount"
           FROM connect_career_domain_groups g
          WHERE $1::boolean IS NULL OR g."isActive" = $1
          ORDER BY g."displayOrder", g."name"`,
        [query.isActive ?? null]
      );
      return APIResponse.success(
        response,
        apiId,
        { items, totalCount: items.length },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUPS_LIST_SUCCESS
      );
    } catch (error) {
      return this.connectService.internalError(
        response,
        apiId,
        "listCareerDomainGroups",
        error
      );
    }
  }

  async saveCareerDomainGroups(
    adminId: string,
    dto: SaveCareerDomainGroupsDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_SAVE;
    const cs = this.connectService;
    try {
      const items = dto.items.map((i) => ({
        ...i,
        key: i.key || toConnectKey(i.name),
      }));
      if (this.hasDuplicateKeys(items)) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.DUPLICATE_KEY,
          HttpStatus.BAD_REQUEST
        );
      }
      const result = await this.saveMasters(
        ConnectCareerDomainGroup,
        items,
        adminId
      );
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUPS_SAVED
      );
    } catch (error) {
      return cs.internalError(
        response,
        apiId,
        "saveCareerDomainGroups",
        error,
        adminId
      );
    }
  }

  /** A rename here shows on every domain of the group (name is stored once) */
  async updateCareerDomainGroup(
    adminId: string,
    id: string,
    dto: UpdateCareerDomainGroupDto,
    response: Response
  ) {
    return this.updateMaster(
      this.groupRepository,
      APIID.CONNECT_ADMIN_CAREER_DOMAIN_GROUP_UPDATE,
      adminId,
      id,
      dto,
      response,
      API_RESPONSES.CONNECT_CAREER_DOMAIN_GROUP_UPDATED
    );
  }

  // ---------------------------------------------------------------------
  // Career domains (sub-domains)
  // ---------------------------------------------------------------------

  async listCareerDomains(query: ListMasterQueryDto, response: Response) {
    const apiId = APIID.CONNECT_ADMIN_CAREER_DOMAIN_LIST;
    try {
      const items = await this.dataSource.query(
        `SELECT d.*, g."key" AS "groupKey", g."name" AS "groupName"
           FROM connect_career_domains d
           JOIN connect_career_domain_groups g ON g."id" = d."groupId"
          WHERE $1::boolean IS NULL OR d."isActive" = $1
          ORDER BY g."displayOrder", d."displayOrder", d."name"`,
        [query.isActive ?? null]
      );
      return APIResponse.success(
        response,
        apiId,
        { items, totalCount: items.length },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_CAREER_DOMAINS_LIST_SUCCESS
      );
    } catch (error) {
      return this.connectService.internalError(
        response,
        apiId,
        "listCareerDomains",
        error
      );
    }
  }

  /**
   * Domains point to a group by groupKey. groupName (optional) creates the
   * group when the key is new, or renames it when different, in the same
   * transaction, so the whole list can be seeded with one call.
   */
  async saveCareerDomains(
    adminId: string,
    dto: SaveCareerDomainsDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_CAREER_DOMAIN_SAVE;
    const cs = this.connectService;
    try {
      const items = dto.items.map((i) => ({
        ...i,
        key: i.key || toConnectKey(i.name),
      }));
      if (this.hasDuplicateKeys(items)) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.DUPLICATE_KEY,
          HttpStatus.BAD_REQUEST
        );
      }
      const groupNames = new Map<string, string>();
      for (const i of items.filter((i) => i.groupName)) {
        if (
          groupNames.has(i.groupKey) &&
          groupNames.get(i.groupKey) !== i.groupName
        ) {
          return cs.fail(
            response,
            apiId,
            CONNECT_ERRORS.GROUP_NAME_MISMATCH,
            HttpStatus.BAD_REQUEST
          );
        }
        groupNames.set(i.groupKey, i.groupName);
      }
      const groupKeys = [...new Set(items.map((i) => i.groupKey))];
      const existingGroups = await this.groupRepository.find({
        where: { key: In(groupKeys) },
        select: ["key"],
      });
      const known = new Set(existingGroups.map((g) => g.key));
      if (groupKeys.some((k) => !known.has(k) && !groupNames.has(k))) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.GROUP_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.dataSource.transaction(async (manager) => {
        const groups = await this.upsertByKey(
          manager,
          ConnectCareerDomainGroup,
          groupKeys
            .filter((k) => groupNames.has(k))
            .map((k) => ({ key: k, name: groupNames.get(k) })),
          adminId
        );
        const allGroups = await manager
          .getRepository(ConnectCareerDomainGroup)
          .find({ where: { key: In(groupKeys) } });
        const groupByKey = new Map(allGroups.map((g) => [g.key, g]));

        const domains = await this.upsertByKey(
          manager,
          ConnectCareerDomain,
          items.map((item) => {
            const { groupKey, ...rest } = item;
            delete rest.groupName; // stored on the group, not the domain
            return { ...rest, groupId: groupByKey.get(groupKey).id };
          }),
          adminId
        );
        const groupById = new Map(allGroups.map((g) => [g.id, g]));
        return {
          ...this.toSaveResult(domains),
          groupsCreated: this.toSaveResult(groups).created,
          items: domains.rows.map((d) => ({
            ...d,
            groupKey: groupById.get(d.groupId)?.key,
            groupName: groupById.get(d.groupId)?.name,
          })),
        };
      });
      await this.cacheService.del(CONNECT_CACHE.OPTIONS_KEY);

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_CAREER_DOMAINS_SAVED
      );
    } catch (error) {
      return cs.internalError(
        response,
        apiId,
        "saveCareerDomains",
        error,
        adminId
      );
    }
  }

  async updateCareerDomain(
    adminId: string,
    id: string,
    dto: UpdateCareerDomainDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_CAREER_DOMAIN_UPDATE;
    const { groupKey, ...rest } = dto;
    const patch: Partial<ConnectCareerDomain> = { ...rest };
    if (groupKey !== undefined) {
      const group = await this.groupRepository.findOne({
        where: { key: groupKey },
        select: ["id"],
      });
      if (!group) {
        return this.connectService.fail(
          response,
          apiId,
          CONNECT_ERRORS.GROUP_NOT_FOUND,
          HttpStatus.BAD_REQUEST
        );
      }
      patch.groupId = group.id;
    }
    return this.updateMaster(
      this.careerDomainRepository,
      apiId,
      adminId,
      id,
      patch,
      response,
      API_RESPONSES.CONNECT_CAREER_DOMAIN_UPDATED
    );
  }

  // ---------------------------------------------------------------------
  // "Open to" options (support_offering_types)
  // ---------------------------------------------------------------------

  async listSupportOfferings(query: ListMasterQueryDto, response: Response) {
    const apiId = APIID.CONNECT_ADMIN_SUPPORT_OFFERING_LIST;
    try {
      const items = await this.supportOfferingRepository.find({
        where: query.isActive === undefined ? {} : { isActive: query.isActive },
        order: { displayOrder: "ASC", label: "ASC" },
      });
      return APIResponse.success(
        response,
        apiId,
        { items, totalCount: items.length },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_SUPPORT_OFFERINGS_LIST_SUCCESS
      );
    } catch (error) {
      return this.connectService.internalError(
        response,
        apiId,
        "listSupportOfferings",
        error
      );
    }
  }

  async saveSupportOfferings(
    adminId: string,
    dto: SaveSupportOfferingsDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_SUPPORT_OFFERING_SAVE;
    const cs = this.connectService;
    try {
      const items = dto.items.map((i) => ({
        ...i,
        key: i.key || toConnectKey(i.label),
      }));
      if (this.hasDuplicateKeys(items)) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.DUPLICATE_KEY,
          HttpStatus.BAD_REQUEST
        );
      }
      const result = await this.saveMasters(
        SupportOfferingType,
        items,
        adminId
      );
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_SUPPORT_OFFERINGS_SAVED
      );
    } catch (error) {
      return cs.internalError(
        response,
        apiId,
        "saveSupportOfferings",
        error,
        adminId
      );
    }
  }

  async updateSupportOffering(
    adminId: string,
    id: string,
    dto: UpdateSupportOfferingDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_SUPPORT_OFFERING_UPDATE;
    return this.updateMaster(
      this.supportOfferingRepository,
      apiId,
      adminId,
      id,
      dto,
      response,
      API_RESPONSES.CONNECT_SUPPORT_OFFERING_UPDATED
    );
  }

  // ---------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------

  /** Create-or-update by key in one transaction, then clear the options cache */
  private async saveMasters<T extends MasterEntity>(
    entity: EntityTarget<T>,
    items: (Partial<T> & { key: string })[],
    adminId: string
  ) {
    const saved = await this.dataSource.transaction((manager) =>
      this.upsertByKey(manager, entity, items, adminId)
    );
    await this.cacheService.del(CONNECT_CACHE.OPTIONS_KEY);
    return { ...this.toSaveResult(saved), items: saved.rows };
  }

  /**
   * Existing rows: only the sent fields change (displayOrder kept if not sent).
   * New rows without displayOrder go after the current last item.
   */
  private async upsertByKey<T extends MasterEntity>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    items: (Partial<T> & { key: string })[],
    adminId: string
  ): Promise<{ rows: T[]; existingKeys: Set<string> }> {
    if (!items.length) return { rows: [], existingKeys: new Set() };
    const repo = manager.getRepository(entity);
    const existing = await repo.find({
      where: { key: In(items.map((i) => i.key)) } as any,
    });
    const byKey = new Map(existing.map((e) => [e.key, e]));
    let nextOrder =
      ((await repo.maximum("displayOrder" as any)) as number) ?? 0;

    const rows = items.map((item) => {
      const current = byKey.get(item.key);
      if (current) {
        return repo.merge(current, { ...item, updatedBy: adminId } as any);
      }
      return repo.create({
        ...item,
        displayOrder: item.displayOrder ?? ++nextOrder,
        createdBy: adminId,
        updatedBy: adminId,
      } as any);
    });
    return {
      rows: (await repo.save(rows as any)) as T[],
      existingKeys: new Set(byKey.keys()),
    };
  }

  private toSaveResult(saved: {
    rows: MasterEntity[];
    existingKeys: Set<string>;
  }) {
    const created = saved.rows.filter(
      (r) => !saved.existingKeys.has(r.key)
    ).length;
    return { created, updated: saved.rows.length - created };
  }

  private async updateMaster<T extends MasterEntity>(
    repo: Repository<T>,
    apiId: string,
    adminId: string,
    id: string,
    dto: Partial<T>,
    response: Response,
    successMessage: string
  ) {
    const cs = this.connectService;
    try {
      if (!Object.values(dto).some((v) => v !== undefined)) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.NOTHING_TO_UPDATE,
          HttpStatus.BAD_REQUEST
        );
      }
      const row = await repo.findOne({ where: { id } as any });
      if (!row) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.MASTER_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      const saved = await repo.save(
        repo.merge(row, { ...dto, updatedBy: adminId } as any)
      );
      await this.cacheService.del(CONNECT_CACHE.OPTIONS_KEY);
      return APIResponse.success(
        response,
        apiId,
        saved,
        HttpStatus.OK,
        successMessage
      );
    } catch (error) {
      return cs.internalError(response, apiId, "updateMaster", error, adminId);
    }
  }

  private hasDuplicateKeys(items: { key: string }[]): boolean {
    return new Set(items.map((i) => i.key)).size !== items.length;
  }
}
