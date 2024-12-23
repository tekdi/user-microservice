// typeorm.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { EntityManager, Repository } from "typeorm";
import { TypeormService } from "./typeorm";
import { Tenant } from "../tenant/entities/tenent.entity";
import { User } from "src/user/entities/user-entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";

const entityArray = [Tenant, User];
describe("TypeormService", () => {
  let service: TypeormService;
  let entityManager: EntityManager;
  let entityRepository: Repository<Tenant>; // Use your entity here

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeormService, EntityManager],
      imports: [
        ConfigModule.forRoot({ isGlobal: true }), // Ensure ConfigModule is loaded globally in tests
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (configService: ConfigService) => ({
            type: "postgres",
            host: configService.get("POSTGRES_HOST"),
            port: configService.get("POSTGRES_PORT"),
            database: configService.get("POSTGRES_DATABASE"),
            username: configService.get("POSTGRES_USERNAME"),
            password: configService.get("POSTGRES_PASSWORD"),
            entities: [Tenant], // Register your entities
            synchronize: true, // Auto synchronize (use cautiously in production)
          }),
        }),
        TypeOrmModule.forFeature([Tenant]),
      ],
    }).compile();

    service = module.get<TypeormService>(TypeormService);
    entityManager = module.get<EntityManager>(EntityManager);
    // userRepository = {
    //   find: jest.fn(), // Mock find method
    //   save: jest.fn(),
    //   update: jest.fn(),
    //   findOne: jest.fn(),
    //   delete: jest.fn(),
    //   query: jest.fn(),
    // } as any; // Casting to Repository<any> (or specific entity type)

    // Mock getRepository to return the mocked repository for the entity
    //jest.spyOn(entityManager, "getRepository").mockReturnValue(userRepository);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("find", () => {
    it("should return an array of entities", async () => {
      // const mockUsers = [
      //   { id: 1, name: "John Doe", email: "john@example.com" },
      //   { id: 2, name: "Jane Doe", email: "jane@example.com" },
      // ];

      // Mocking the behavior of the repository's find method
      // jest.spyOn(userRepository, "find").mockResolvedValue(mockUsers);

      const result = await service.find(Tenant, {}); // Pass entity name and options
      console.log("result: ", result);
      expect(result).not.toBeNull();
      expect(entityRepository.find).toHaveBeenCalledWith({});
    });

    // it("should return an empty array if no records found", async () => {
    //   // Mocking the behavior of the repository's find method
    //   jest.spyOn(userRepository, "find").mockResolvedValue([]);

    //   const result = await service.find("User", {});
    //   expect(result).toEqual([]);
    //   expect(userRepository.find).toHaveBeenCalledWith({});
    // });

    // it("should handle errors and return an empty array if find throws an error", async () => {
    //   jest
    //     .spyOn(userRepository, "find")
    //     .mockRejectedValue(new Error("Database error"));

    //   await expect(service.find("User", {})).rejects.toThrowError(
    //     "Database error"
    //   );
    // });
  });
  // describe("save", () => {
  //   it("should save and return the saved entity", async () => {
  //     const mockUser = { id: 1, name: "John Doe", email: "john@example.com" };

  //     // Mocking the behavior of the repository's save method
  //     jest.spyOn(userRepository, "save").mockResolvedValue(mockUser);

  //     const result = await service.save("User", mockUser); // Pass entity name and the user data
  //     expect(result).toEqual(mockUser);
  //     expect(userRepository.save).toHaveBeenCalledWith(mockUser);
  //   });

  //   it("should handle errors and throw an error if save fails", async () => {
  //     const mockUser = { id: 1, name: "John Doe", email: "john@example.com" };

  //     // Mocking the behavior of the repository's save method to throw an error
  //     jest
  //       .spyOn(userRepository, "save")
  //       .mockRejectedValue(new Error("Save failed"));

  //     await expect(service.save("User", mockUser)).rejects.toThrowError(
  //       "Save failed"
  //     );
  //     expect(userRepository.save).toHaveBeenCalledWith(mockUser);
  //   });
  // });
  // describe("update", () => {
  //   it("should update and return the updated entity", async () => {
  //     const mockUser = { id: 1, name: "John Doe", email: "john@example.com" };
  //     const updatedUser = {
  //       id: 1,
  //       name: "John Updated",
  //       email: "john.updated@example.com",
  //     };

  //     // Mocking the behavior of the repository's update method to return a valid UpdateResult
  //     const mockUpdateResult: UpdateResult = {
  //       generatedMaps: [],
  //       raw: [],
  //       affected: 1,
  //     };

  //     jest.spyOn(userRepository, "update").mockResolvedValue(mockUpdateResult);

  //     // Mocking the behavior of the repository's findOne method to get updated data
  //     jest.spyOn(userRepository, "findOne").mockResolvedValue(updatedUser);

  //     const result = await service.update("User", 1, updatedUser); // Pass entity name, id, and updated data
  //     expect(result).toEqual(updatedUser);
  //     expect(userRepository.update).toHaveBeenCalledWith(1, updatedUser);
  //     expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  //   });

  //   it("should return null if the entity to update does not exist", async () => {
  //     const updatedUser = {
  //       id: 1,
  //       name: "John Updated",
  //       email: "john.updated@example.com",
  //     };

  //     // Mocking the behavior of the repository's update method to return an UpdateResult with no affected rows
  //     const mockUpdateResult: UpdateResult = {
  //       generatedMaps: [],
  //       raw: [],
  //       affected: 0,
  //     };

  //     jest.spyOn(userRepository, "update").mockResolvedValue(mockUpdateResult);

  //     const result = await service.update("User", 1, updatedUser);
  //     expect(result).toBe(undefined);
  //     expect(userRepository.update).toHaveBeenCalledWith(1, updatedUser);
  //   });

  //   it("should handle errors and throw an error if update fails", async () => {
  //     const updatedUser = {
  //       id: 1,
  //       name: "John Updated",
  //       email: "john.updated@example.com",
  //     };

  //     // Mocking the behavior of the repository's update method to throw an error
  //     jest
  //       .spyOn(userRepository, "update")
  //       .mockRejectedValue(new Error("Update failed"));

  //     await expect(service.update("User", 1, updatedUser)).rejects.toThrowError(
  //       "Update failed"
  //     );
  //     expect(userRepository.update).toHaveBeenCalledWith(1, updatedUser);
  //   });
  // });
  // describe("delete", () => {
  //   it("should delete the entity if found", async () => {
  //     const mockUserId = 1;
  //     const mockEntity = { id: 1, name: "John Doe" };

  //     // Mocking the repository and findOne method
  //     const mockRepository = { remove: jest.fn() };
  //     const mockFindOne = jest.fn().mockResolvedValue(mockEntity);

  //     // Use jest.spyOn to mock the getRepository method explicitly
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);
  //     jest.spyOn(service, "findOne").mockResolvedValue(mockEntity);

  //     // Call the delete method
  //     await service.delete("User", mockUserId);

  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(service.findOne).toHaveBeenCalledWith("User", {
  //       where: { id: mockUserId },
  //     });
  //     expect(mockRepository.remove).toHaveBeenCalledWith(mockEntity);
  //   });

  //   it("should throw NotFoundException if the entity is not found", async () => {
  //     const mockUserId = 1;

  //     // Mocking the repository and findOne method
  //     const mockRepository = { remove: jest.fn() };
  //     const mockFindOne = jest.fn().mockResolvedValue(null); // Simulating entity not found

  //     // Use jest.spyOn to mock the getRepository method explicitly
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);
  //     jest.spyOn(service, "findOne").mockResolvedValue(null);

  //     // Expecting NotFoundException to be thrown
  //     await expect(service.delete("User", mockUserId)).rejects.toThrowError(
  //       "String not found"
  //     );

  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(service.findOne).toHaveBeenCalledWith("User", {
  //       where: { id: mockUserId },
  //     });
  //     expect(mockRepository.remove).not.toHaveBeenCalled();
  //   });

  //   it("should handle errors during the removal process", async () => {
  //     const mockUserId = 1;
  //     const mockEntity = { id: 1, name: "John Doe" };

  //     // Mocking the repository and findOne method
  //     const mockRepository = {
  //       remove: jest.fn().mockRejectedValue(new Error("Database error")),
  //     };
  //     const mockFindOne = jest.fn().mockResolvedValue(mockEntity);
  //     // Use jest.spyOn to mock the getRepository method explicitly
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);
  //     jest.spyOn(service, "findOne").mockResolvedValue(mockEntity);

  //     // Expecting the error to be thrown
  //     await expect(service.delete("User", mockUserId)).rejects.toThrowError(
  //       "Database error"
  //     );

  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(service.findOne).toHaveBeenCalledWith("User", {
  //       where: { id: mockUserId },
  //     });
  //     expect(mockRepository.remove).toHaveBeenCalledWith(mockEntity);
  //   });
  // });
  // describe("query", () => {
  //   it("should execute a raw query and return the result", async () => {
  //     const mockQuery = "SELECT * FROM users WHERE id = $1";
  //     const mockParameters = [1];
  //     const mockResult = [
  //       { id: 1, name: "John Doe", email: "john@example.com" },
  //     ];

  //     // Mock the repository and the query method
  //     const mockRepository = { query: jest.fn().mockResolvedValue(mockResult) };

  //     // Mocking the getRepository method to return the mock repository
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);

  //     // Call the query method
  //     const result = await service.query("User", mockQuery, mockParameters);

  //     // Ensure the repository.query was called with the correct arguments
  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(mockRepository.query).toHaveBeenCalledWith(
  //       mockQuery,
  //       mockParameters
  //     );

  //     // Ensure the result matches the mock data
  //     expect(result).toEqual(mockResult);
  //   });

  //   it("should return an empty array if the query returns no results", async () => {
  //     const mockQuery = "SELECT * FROM users WHERE id = $1";
  //     const mockParameters = [999];
  //     const mockResult: any[] = []; // No results returned

  //     // Mock the repository and the query method
  //     const mockRepository = { query: jest.fn().mockResolvedValue(mockResult) };

  //     // Mocking the getRepository method to return the mock repository
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);

  //     // Call the query method
  //     const result = await service.query("User", mockQuery, mockParameters);

  //     // Ensure the repository.query was called with the correct arguments
  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(mockRepository.query).toHaveBeenCalledWith(
  //       mockQuery,
  //       mockParameters
  //     );

  //     // Ensure the result is an empty array
  //     expect(result).toEqual(mockResult);
  //   });

  //   it("should throw an error if query execution fails", async () => {
  //     const mockQuery = "SELECT * FROM users WHERE id = $1";
  //     const mockParameters = [1];
  //     const mockError = "Database error";

  //     // Mock the repository to simulate an error during query execution
  //     const mockRepository = {
  //       query: jest.fn().mockRejectedValue(new Error(mockError)),
  //     };

  //     // Mocking the getRepository method to return the mock repository
  //     const getRepositorySpy = jest
  //       .spyOn(service as any, "getRepository")
  //       .mockReturnValue(mockRepository as unknown as Repository<any>);

  //     // Expecting an error to be thrown
  //     await expect(
  //       service.query("User", mockQuery, mockParameters)
  //     ).rejects.toThrowError(mockError);

  //     // Ensure the repository.query was called with the correct arguments
  //     expect(getRepositorySpy).toHaveBeenCalledWith("User");
  //     expect(mockRepository.query).toHaveBeenCalledWith(
  //       mockQuery,
  //       mockParameters
  //     );
  //   });
  // });
});
