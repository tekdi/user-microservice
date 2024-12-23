import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, EntityTarget, Repository } from "typeorm";
import { InjectEntityManager } from "@nestjs/typeorm";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { ConfigService } from "@nestjs/config";
import { User } from "src/user/entities/user-entity";
import { Form } from "src/forms/entities/form.entity";

@Injectable()
export class TypeormService {
  // constructor(
  //   @InjectEntityManager() private readonly entityManager: EntityManager
  // ) {}
  private dataSource: DataSource;
  private entityManager: EntityManager;

  constructor(private configService: ConfigService) {
    this.initialize();
  }

  async initialize() {
    try {
      // Create DataSource instance
      this.dataSource = new DataSource({
        type: "postgres",
        host: this.configService.get("POSTGRES_HOST"),
        port: this.configService.get("POSTGRES_PORT"),
        database: this.configService.get("POSTGRES_DATABASE"),
        username: this.configService.get("POSTGRES_USERNAME"),
        password: this.configService.get("POSTGRES_PASSWORD"),
        entities: [Tenant], // Add your entities here, e.g., [User, Product]
        synchronize: true, // For development only, set to false in production
      });

      // Initialize DataSource
      await this.dataSource.initialize();

      // After DataSource is initialized, set the entity manager
      this.entityManager = this.dataSource.manager;
      console.log("DataSource initialized and EntityManager set.");
    } catch (error) {
      console.error("Error initializing DataSource:", error);
      throw new Error("TypeORM DataSource initialization failed.");
    }
  }

  // Now you can use this.entityManager to access repositories
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

  // Save a new entity or update existing
  async save<T>(entity: T, createData): Promise<T> {
    try {
      const repository = this.getRepository(entity.constructor as any);
      return repository.save(createData);
    } catch (err) {
      throw new Error(err);
    }
  }

  // Update an entity
  async update<T>(entity, id: number, updateData): Promise<T> {
    try {
      const repository = this.getRepository(entity);
      await repository.update(id, updateData);
      return this.findOne(entity, { where: { id } });
    } catch (err) {
      throw new Error(err);
    }
  }

  // Remove an entity
  async delete<T>(entity, id: number): Promise<void> {
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
