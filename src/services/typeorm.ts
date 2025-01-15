import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { DataSource, DeepPartial, EntityManager, EntityTarget, Repository } from "typeorm";
import { Tenant } from "../tenant/entities/tenent.entity";
import { ConfigService } from "@nestjs/config";
import { AcademicYear } from "../academicyears/entities/academicyears-entity";
import { Tenants } from "../userTenantMapping/entities/tenant.entity";
import { CohortAcademicYear } from "src/cohortAcademicYear/entities/cohortAcademicYear.entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { User } from "src/user/entities/user-entity";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";

@Injectable()
export class TypeormService implements OnModuleInit, OnApplicationShutdown {
  private dataSource: DataSource;
  private entityManager: EntityManager;

  constructor(private readonly configService: ConfigService) {
  }
  async onModuleInit() {
    await this.initialize();
  }

  async initialize() {
    if (this.dataSource?.isInitialized) return;
    try {
      this.dataSource = new DataSource({
        type: "postgres",
        host: this.configService.get("POSTGRES_HOST"),
        port: this.configService.get<number>("POSTGRES_PORT"),
        database: this.configService.get("POSTGRES_DATABASE"),
        username: this.configService.get("POSTGRES_USERNAME"),
        password: this.configService.get("POSTGRES_PASSWORD"),
        entities: [Tenant, AcademicYear, Tenants, CohortAcademicYear, CohortMembers, User, UserTenantMapping, Cohort, Fields, FieldValues, UserRoleMapping, Role], // Add your entities here
        synchronize: false,
      });

      await this.dataSource.initialize();

      this.entityManager = this.dataSource.manager;
      console.log("DataSource initialized and EntityManager set.");
    } catch (error) {
      console.error("Error initializing DataSource:", error);
      throw new Error("TypeORM DataSource initialization failed.");
    }
  }

  async onApplicationShutdown() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  private getRepository<T>(entity: EntityTarget<T>): Repository<T> {
    if (!this.entityManager) {
      throw new Error("EntityManager is not initialized.");
    }
    return this.entityManager.getRepository(entity);
  }

  // Find all records or by custom condition
  async find<T>(entity: EntityTarget<T>, options?: object): Promise<T[]> {
    try {
      const repository = this.getRepository(entity);
      if (!repository) {
        throw new Error(
          "Repository is not available or not properly initialized."
        );
      }
      return repository.find(options);
    } catch (err) {
      throw new Error(err);
    }
  }

  // Find one record by conditions
  async findOne<T>(
    entity: EntityTarget<T>,
    conditions: object
  ): Promise<T | undefined> {
    try {
      const repository = this.getRepository(entity);
      return repository.findOne(conditions);
    } catch (err) {
      throw new Error(err);
    }
  }
  async findAndCount<T>(entity: EntityTarget<T>,
    conditions: object) {
    try {
      const repository = this.getRepository(entity);
      return repository.findAndCount(conditions);
    } catch (err) {
      throw new Error(err);
    }
  }

  // Save a new entity or update existing
  async save<T>(entity: EntityTarget<T>, data: Partial<T>): Promise<T> {
    return await this.getRepository(entity).save(data as DeepPartial<T>);
  }

  async update<T>(
    entity,
    conditions,
    updateData
  ): Promise<T> {
    try {
      const repository = this.getRepository(entity);
      await repository.update(conditions, updateData);
      return this.findOne(entity, { where: conditions });
    } catch (err) {
      throw new Error(err.message || 'Error updating entity');
    }
  }


  // Remove an entity
  async delete<T>(entity, id): Promise<void> {
    try {
      const repository = this.getRepository(entity);
      const entityToRemove = await this.findOne(entity, { where: { id } });
      if (!entityToRemove) {
        throw new Error(`${entity.constructor.name} not found`);
      }
      await repository.remove(entityToRemove);
    } catch (err) {
      throw new Error(err);
    }
  }

  async query<T>(entity, query: string, parameters?: any[]): Promise<any> {
    try {
      // Get the repository for the given entity
      const repository: Repository<T> = this.getRepository(entity);

      // Execute the raw query
      const result = await repository.query(query, parameters);

      // Return the result (could be rows, status, etc., depending on the query)
      return result;
    } catch (err) {
      throw new Error(err);
    }
  }
}
