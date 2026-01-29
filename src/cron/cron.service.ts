import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserService } from "../user/user.service";
import { FieldsService } from "../fields/fields.service";
import { CohortMembersService } from "../cohortMembers/cohortMembers.service";
import { UserTenantMappingService } from "../userTenantMapping/user-tenant-mapping.service";
import { Cohort } from "../cohort/entities/cohort.entity";
import { CohortMembers } from "../cohortMembers/entities/cohort-member.entity";
import { CohortAcademicYear } from "../cohortAcademicYear/entities/cohortAcademicYear.entity";
import { UserTenantMapping } from "../userTenantMapping/entities/user-tenant-mapping.entity";
import { UserTenantMappingStatus } from "../userTenantMapping/entities/user-tenant-mapping.entity";
import { MemberStatus } from "../cohortMembers/entities/cohort-member.entity";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { format } from "date-fns";
import { navapathamConfig } from "./navapatham.config";
import { KafkaService } from "../kafka/kafka.service";
import { User } from "../user/entities/user-entity";
import { Tenant } from "../tenant/entities/tenent.entity";
import { UserRoleMapping } from "../rbac/assign-role/entities/assign-role.entity";
import { SSO_DEFAULTS } from "../constants/sso.constants";

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private readonly apiId = "cron.navapatham.assignStudents";
  private readonly pragyanpathApiId = "cron.pragyanpath.mapUsers";

  constructor(
    @InjectRepository(Cohort)
    private readonly cohortRepository: Repository<Cohort>,
    @InjectRepository(CohortMembers)
    private readonly cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(CohortAcademicYear)
    private readonly cohortAcademicYearRepository: Repository<CohortAcademicYear>,
    @InjectRepository(UserTenantMapping)
    private readonly userTenantMappingRepository: Repository<UserTenantMapping>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(UserRoleMapping)
    private readonly userRoleMappingRepository: Repository<UserRoleMapping>,
    private readonly userService: UserService,
    private readonly fieldsService: FieldsService,
    private readonly cohortMembersService: CohortMembersService,
    private readonly userTenantMappingService: UserTenantMappingService,
    private readonly kafkaService: KafkaService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async assignStudentsToBatches() {
    this.logger.log("Starting Navapatham student batch assignment cron job");
    LoggerUtil.log("Navapatham cron job started", this.apiId);

    try {
      // Step 1: Get configuration
      const tenantId = navapathamConfig.tenantId;
      const academicYearId = navapathamConfig.academicYearId;

      if (!tenantId || !academicYearId) {
        const errorMsg =
          "Missing required configuration: tenantId or academicYearId in navapatham.config.ts";
        this.logger.error(errorMsg);
        LoggerUtil.error(errorMsg, "", this.apiId);
        return;
      }

      // Step 2: Get today's date (YYYY-MM-DD format)
      const todayDate = format(new Date(), "yyyy-MM-dd");

      // Step 3: Fetch eligible users
      const userSearchDto = {

        filters: {
          fromDate: todayDate,
          state: ["36"], // Telangana state ID
          tenantStatus: ["pending"],
        },
        includeCustomFields: "true",
      };

      const userData = await this.userService.findAllUserDetails(
        userSearchDto,
        tenantId,
        true
      );
      if (!userData || !userData.getUserDetails || userData.getUserDetails.length === 0) {
        this.logger.log("No eligible users found for assignment");
        LoggerUtil.log("No eligible users found", this.apiId);
        return;
      }

      const users = userData.getUserDetails;
      this.logger.log(`Found ${users.length} eligible users`);
      LoggerUtil.log(`Found ${users.length} eligible users`, this.apiId);

      let assignedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      // Step 4: Process each user
      for (const user of users) {
        try {
          // Step 4.1: Extract user's districtId
          const districtField = user.customFields?.find(
            (field) => field.name?.toLowerCase() === "district" || field.label?.toLowerCase() === "district"
          );

          if (!districtField || !districtField.selectedValues || districtField.selectedValues.length === 0) {
            skippedCount++;
            this.logger.warn(
              `User ${user.userId} does not have district field in customFields`
            );
            continue;
          }

          // Extract districtId - format is {id: <id>, value: "<name>"}
          const firstValue = districtField.selectedValues[0];
          if (!firstValue || typeof firstValue !== 'object' || !firstValue.id) {
            skippedCount++;
            this.logger.warn(`User ${user.userId} has invalid district field format`);
            continue;
          }

          // districtId can be number or string, convert to string for comparison
          const districtIdStr = String(firstValue.id).trim();
          
          if (!districtIdStr) {
            skippedCount++;
            this.logger.warn(`User ${user.userId} has empty districtId`);
            continue;
          }

          // Step 4.2: Find cohorts by districtId
          const cohortIds = await this.fieldsService.filterUserUsingCustomFieldsOptimized(
            "COHORT",
            { district: districtIdStr }
          );

          if (!cohortIds || cohortIds.length === 0) {
            skippedCount++;
            this.logger.warn(
              `No cohorts found for user ${user.userId} with districtId ${districtIdStr}`
            );
            continue;
          }

          this.logger.log(
            `Found ${cohortIds.length} cohort(s) for user ${user.userId} with districtId ${districtIdStr}: ${cohortIds.join(', ')}`
          );

          // Step 4.1b: Extract user's blockId for batch matching
          const blockField = user.customFields?.find(
            (field) => field.name?.toLowerCase() === "block" || field.label?.toLowerCase() === "block"
          );

          if (!blockField || !blockField.selectedValues || blockField.selectedValues.length === 0) {
            skippedCount++;
            this.logger.warn(
              `User ${user.userId} does not have block field in customFields for batch matching`
            );
            continue;
          }

          // Extract blockId for batch matching
          const blockFirstValue = blockField.selectedValues[0];
          if (!blockFirstValue || typeof blockFirstValue !== 'object' || !blockFirstValue.id) {
            skippedCount++;
            this.logger.warn(`User ${user.userId} has invalid block field format for batch matching`);
            continue;
          }

          const blockIdStr = String(blockFirstValue.id).trim();
          
          if (!blockIdStr) {
            skippedCount++;
            this.logger.warn(`User ${user.userId} has empty blockId for batch matching`);
            continue;
          }

          let assigned = false;

          // Step 4.3: Process each cohort
          for (const cohortId of cohortIds) {
            if (assigned) break;

            // Step 4.4: Find batches for this cohort
            const batches = await this.cohortRepository.find({
              where: {
                parentId: cohortId,
                type: "BATCH",
                status: "active",
                tenantId: tenantId,
              },
              order: {
                name: "ASC",
              },
            });

            if (!batches || batches.length === 0) {
              continue;
            }

            // Step 4.5: Filter batches by metadata (parse and compare)
            // Metadata format is always JSON object: {blockId: "881"} or {blockId: 881}
            const matchingBatches = batches.filter((batch) => {
              if (!batch.metadata || typeof batch.metadata !== 'object' || batch.metadata === null) {
                return false;
              }

              // Metadata is always an object with blockId key
              const batchBlockId = (batch.metadata as any).blockId;
              if (!batchBlockId) {
                return false;
              }

              // Compare as strings (blockId can be number or string)
              return String(batchBlockId).trim() === blockIdStr;
            });

            if (matchingBatches.length === 0) {
              continue;
            }

            // Step 4.6: Find available batch and assign
            for (const batch of matchingBatches) {
              if (assigned) break;

              try {
                // Get CohortAcademicYear
                const cohortAcademicYear =
                  await this.cohortAcademicYearRepository.findOne({
                    where: {
                      cohortId: batch.cohortId,
                      academicYearId: academicYearId,
                    },
                  });

                if (!cohortAcademicYear) {
                  this.logger.warn(
                    `No CohortAcademicYear found for batch ${batch.cohortId} and academic year ${academicYearId}`
                  );
                  continue;
                }

                // Count active members
                const memberCount =
                  await this.cohortMembersRepository.count({
                    where: {
                      cohortId: batch.cohortId,
                      cohortAcademicYearId:
                        cohortAcademicYear.cohortAcademicYearId,
                      status: MemberStatus.ACTIVE,
                    },
                  });

                // Check if batch has capacity
                if (memberCount < 100) {
                  // Check if user is already assigned to this batch
                  const existingMember =
                    await this.cohortMembersRepository.findOne({
                      where: {
                        userId: user.userId,
                        cohortId: batch.cohortId,
                        cohortAcademicYearId:
                          cohortAcademicYear.cohortAcademicYearId,
                      },
                    });

                  if (existingMember) {
                    this.logger.warn(
                      `User ${user.userId} is already assigned to batch ${batch.cohortId}`
                    );
                    assigned = true;
                    break;
                  }

                  // Create CohortMember
                  const newMember = this.cohortMembersRepository.create({
                    cohortId: batch.cohortId,
                    cohortAcademicYearId:
                      cohortAcademicYear.cohortAcademicYearId,
                    userId: user.userId,
                    status: MemberStatus.ACTIVE,
                    statusReason: "Auto-assigned by Navapatham cron job",
                    createdBy: user.userId,
                    updatedBy: user.userId,
                  });

                  await this.cohortMembersRepository.save(newMember);

                  // Publish Kafka event for cohort member creation
                  try {
                    await this.kafkaService.publishCohortMemberEvent(
                      'created',
                      {
                        cohortId: batch.cohortId,
                        userId: user.userId,
                        cohortAcademicYearId: cohortAcademicYear.cohortAcademicYearId,
                        status: MemberStatus.ACTIVE,
                        statusReason: "Auto-assigned by Navapatham cron job",
                        createdBy: user.userId,
                        updatedBy: user.userId,
                      },
                      newMember.cohortMembershipId
                    );
                  } catch (kafkaError) {
                    // Log error but don't fail the assignment
                    this.logger.error(
                      `Failed to publish cohort member Kafka event for user ${user.userId}: ${kafkaError.message}`
                    );
                  }

                  // Update UserTenantMapping status
                  await this.userTenantMappingRepository.update(
                    {
                      userId: user.userId,
                      tenantId: tenantId,
                    },
                    {
                      status: UserTenantMappingStatus.ACTIVE,
                      updatedAt: new Date(),
                    }
                  );

                  // Publish Kafka event for user tenant mapping status update
                  try {
                    await this.userTenantMappingService.publishUserTenantMappingEvent(
                      'updated_status',
                      user.userId,
                      tenantId,
                      this.apiId
                    );
                  } catch (kafkaError) {
                    // Log error but don't fail the assignment
                    this.logger.error(
                      `Failed to publish user tenant mapping Kafka event for user ${user.userId}: ${kafkaError.message}`
                    );
                  }

                  assigned = true;
                  assignedCount++;
                  this.logger.log(
                    `Assigned user ${user.userId} to batch ${batch.cohortId} (${memberCount + 1}/100)`
                  );
                  break;
                } else {
                  // Batch is full, try next batch
                  this.logger.debug(
                    `Batch ${batch.cohortId} is full (${memberCount}/100), trying next batch`
                  );
                }
              } catch (error) {
                this.logger.error(
                  `Error processing batch ${batch.cohortId} for user ${user.userId}: ${error.message}`
                );
                errors.push(
                  `User ${user.userId}, Batch ${batch.cohortId}: ${error.message}`
                );
              }
            }
          }

          if (!assigned) {
            skippedCount++;
            this.logger.warn(
              `Could not assign user ${user.userId} - no available batch found`
            );
          }
        } catch (error) {
          skippedCount++;
          const errorMsg = `Error processing user ${user.userId}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Log summary
      const summary = {
        totalUsers: users.length,
        assigned: assignedCount,
        skipped: skippedCount,
        errors: errors.length,
      };

      this.logger.log(
        `Cron job completed. Summary: ${JSON.stringify(summary)}`
      );
      LoggerUtil.log(
        `Cron job completed. Assigned: ${assignedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`,
        this.apiId
      );

      if (errors.length > 0) {
        this.logger.warn(`Errors encountered: ${JSON.stringify(errors)}`);
      }
    } catch (error) {
      const errorMsg = `Fatal error in cron job: ${error.message}`;
      this.logger.error(errorMsg, error.stack);
      LoggerUtil.error(errorMsg, error.stack, this.apiId);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async mapPrathaUsersToTenant() {
    this.logger.log("Starting Pragyanpath user tenant mapping cron job");
    LoggerUtil.log("Pragyanpath cron job started", this.pragyanpathApiId);

    try {
      // Step 1: Get today's date (YYYY-MM-DD format)
      const todayDate = format(new Date(), "yyyy-MM-dd");


      const pragyanpathTenantId = SSO_DEFAULTS.DEFAULT_TENANT_ID;
      this.logger.log(`Found pragyanpath tenant with ID: ${pragyanpathTenantId}`);

      // Step 3: Fetch users created today with pratha.org email domain
      const usersCreatedToday = await this.userRepository
        .createQueryBuilder("user")
        .where("DATE(user.createdAt) = :todayDate", { todayDate })
        .andWhere("user.email LIKE :emailDomain", { emailDomain: "%@pratham.org" })
        .getMany();
 
      if (!usersCreatedToday || usersCreatedToday.length === 0) {
        this.logger.log("No users with pratha.org email created today");
        LoggerUtil.log("No users with pratha.org email found", this.pragyanpathApiId);
        return;
      }

      this.logger.log(`Found ${usersCreatedToday.length} users with pratha.org email created today`);

      let mappedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      // Step 4: Process each user
      for (const user of usersCreatedToday) {
        try {
          // Step 4.1: Check if user is already mapped to pragyanpath tenant
          const existingMapping = await this.userTenantMappingRepository.findOne({
            where: {
              userId: user.userId,
              tenantId: pragyanpathTenantId,
            },
          });

          if (existingMapping) {
            skippedCount++;
            this.logger.log(
              `User ${user.userId} (${user.email}) is already mapped to pragyanpath tenant`
            );
            continue;
          }

          // Step 4.2: Check if user already has role mapping for this tenant
          const existingRoleMapping = await this.userRoleMappingRepository.findOne({
            where: {
              userId: user.userId,
              tenantId: pragyanpathTenantId,
            },
          });

          // Step 4.3: Create tenant mapping
          await this.userTenantMappingRepository.save({
            userId: user.userId,
            tenantId: pragyanpathTenantId,
            status: UserTenantMappingStatus.ACTIVE,
            createdBy: user.userId,
            updatedBy: user.userId,
          });

          this.logger.log(
            `Created tenant mapping for user ${user.userId} (${user.email})`
          );

          // Step 4.4: Create role mapping if not exists (assign default learner role)
          if (!existingRoleMapping) {
            await this.userRoleMappingRepository.save({
              userId: user.userId,
              tenantId: pragyanpathTenantId,
              roleId: SSO_DEFAULTS.DEFAULT_LEARNER_ROLE_ID,
              createdBy: user.userId,
              updatedBy: user.userId,
            });

            this.logger.log(
              `Created role mapping for user ${user.userId} (${user.email}) with learner role`
            );
          }

          // Step 4.5: Publish Kafka events
          try {
            await this.userTenantMappingService.publishUserTenantMappingEvent(
              'created',
              user.userId,
              pragyanpathTenantId,
              this.pragyanpathApiId
            );
          } catch (kafkaError) {
            // Log error but don't fail the mapping
            this.logger.error(
              `Failed to publish user tenant mapping Kafka event for user ${user.userId}: ${kafkaError.message}`
            );
          }

          mappedCount++;
        } catch (error) {
          skippedCount++;
          const errorMsg = `Error processing user ${user.userId} (${user.email}): ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Log summary
      const summary = {
        totalUsers: usersCreatedToday.length,
        mapped: mappedCount,
        skipped: skippedCount,
        errors: errors.length,
      };

      this.logger.log(
        `Pragyanpath cron job completed. Summary: ${JSON.stringify(summary)}`
      );
      LoggerUtil.log(
        `Pragyanpath cron job completed. Mapped: ${mappedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`,
        this.pragyanpathApiId
      );

      if (errors.length > 0) {
        this.logger.warn(`Errors encountered: ${JSON.stringify(errors)}`);
      }
    } catch (error) {
      const errorMsg = `Fatal error in Pragyanpath cron job: ${error.message}`;
      this.logger.error(errorMsg, error.stack);
      LoggerUtil.error(errorMsg, error.stack, this.pragyanpathApiId);
    }
  }
}
