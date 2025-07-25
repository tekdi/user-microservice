// src/s3.service.ts
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3 } from "aws-sdk";
import { S3Client } from "@aws-sdk/client-s3";
import APIResponse from "../responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { v4 as uuidv4 } from 'uuid';
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, ILike, In, Repository } from "typeorm";
import { User } from "../../user/entities/user-entity";
import { CohortMembers, MemberStatus } from "src/cohortMembers/entities/cohort-member.entity";

@Injectable()
export class OblfService {
constructor(
  private readonly configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(CohortMembers)
    private cohortMembersRepository: Repository<CohortMembers>,
    private readonly dataSource: DataSource,
) {}
    async isCohortExistForYear(academicYearId, cohortId) {
        return await this.dataSource.query(
            `SELECT * FROM "CohortAcademicYear" WHERE "academicYearId" = $1 AND "cohortId" = $2`,
            [academicYearId, cohortId]
        );
    }
    async checkIfActiveYear(academicYearId, tenantId){
        return await this.dataSource.query(
            `SELECT "isActive" FROM "AcademicYears" WHERE "id" = $1 AND "tenantId" = $2`,
            [academicYearId, tenantId]
        );
    }

    getFilterQuery(cohortId, academicYearId, search, roleId, filters: any) {
        const query = this.usersRepository
            .createQueryBuilder('user')
            .innerJoin('UserRolesMapping', 'urm', '"urm"."userId" = "user"."userId"')
            .where('"user"."status" = :status', { status: 'active' })
            .andWhere('"urm"."roleId" = :roleId', { roleId });

            if (filters.classId || filters.schoolId || filters.clusterId) {
                // Build the subquery for users in context
                query.andWhere(qb => {
                const subQuery = qb.subQuery()
                    .select('DISTINCT cm."userId"')
                    .from('CohortMembers', 'cm')
                    .innerJoin('Cohort', 'c', 'c."cohortId" = cm."cohortId"')
                    .innerJoin('CohortAcademicYear', 'cay', 'cay."cohortAcademicYearId" = cm."cohortAcademicYearId"')
                    .where('cay."academicYearId" = :academicYearId');

                if (filters.classId) {
                    subQuery.andWhere('cm."cohortId" = :classId');
                } else if (filters.schoolId) {
                    subQuery.andWhere('c."parentId" = :schoolId');
                } else if (filters.clusterId) {
                    subQuery.andWhere(qb2 => {
                    return `c."parentId" IN (
                        SELECT s."cohortId"::varchar
                        FROM "Cohort" s
                        WHERE s."parentId" = :clusterId
                    )`;
                    });
                }

                return `"user"."userId" IN ` + subQuery.getQuery();
                });
            }

            // Search
            if (search) {
            query.andWhere('"user"."name" ILIKE :search', { search: `%${search}%` });
            }

            // Exclude already in the target cohort + academic year
            query.andWhere(qb => {
                const subQuery = qb.subQuery()
                .select('cm.userId')
                .from('CohortMembers', 'cm')
                .innerJoin('CohortAcademicYear', 'cay', '"cay"."cohortAcademicYearId" = "cm"."cohortAcademicYearId"')
                .where('"cm"."cohortId" = :cohortId')
                .andWhere('"cay"."academicYearId" =  :academicYearId')
                .getQuery();
            return '"user"."userId" NOT IN ' + subQuery;
            });
        return query;
    }    

    async addMembersByfilter(req, response, dto, academicYearId, tenantId){
        const academicYear = await this.checkIfActiveYear(
              academicYearId,
              tenantId
            );
        if (!academicYear) {
            return APIResponse.error(
            response,
            'api.add.cohortMembers',
            HttpStatus.NOT_FOUND.toLocaleString(),
            API_RESPONSES.ACADEMICYEAR_NOT_FOUND,
            HttpStatus.NOT_FOUND
            );
        }

        const cohortExists = await this.isCohortExistForYear(
              academicYearId,
              dto.cohortId
            );
        if (cohortExists.length === 0) {
            return APIResponse.error(
            response,
            'api.add.cohortMembers',
            HttpStatus.NOT_FOUND.toLocaleString(),
            API_RESPONSES.COHORTID_NOTFOUND_FOT_THIS_YEAR(dto.cohortId),
            HttpStatus.NOT_FOUND
            );
        }
        const cohortAcademicYearId = cohortExists[0].cohortAcademicYearId;
        const cohortId = dto["cohortId"];
        const filters = dto["filters"] || {};
        const roleId = filters.roleId;
        const search = filters.search || '';
        try {
             // Get the eligible users subquery (without pagination)
        const { sql: eligibleUsersSql, params } = this.buildEligibleUsersRawSql(
                'insert',
                filters,
                academicYearId,
                cohortId
            );
            // Now use a raw query to insert all eligible users in one go
            const insertSql = `
            INSERT INTO "CohortMembers" ("cohortId", "userId", "status", "cohortAcademicYearId")
            SELECT $${params.length + 1}, user_ids."userId", 'active', $${params.length + 2}
            FROM (${eligibleUsersSql}) AS user_ids
            ON CONFLICT ("cohortId", "userId", "cohortAcademicYearId") DO NOTHING
            `;

            const result = await this.cohortMembersRepository.query(
                insertSql,
                [
                    ...params, // Spread the existing params
                    cohortId,
                    cohortAcademicYearId,
                ]
            );            
            
            return await APIResponse.success(
                response,
                'api.add.cohortMembers',
                result,
                HttpStatus.OK,
                API_RESPONSES.RESET_PASSWORD_LINK_SUCCESS
                );
            } catch (error) {
                return await APIResponse.error(
                response,
                'api.add.eligibleUsers',
                error,
                `Error : ${error.message}`,
                500
                );
            }
    }
     
    async findEligibleUsers(req, response, dto, academicYearId, tenantId): Promise<User[]> 
    {
        const cohortId = dto["cohortId"];
        const offset = dto["offset"] || 0;
        const limit = dto["limit"] || 20;
        const filters = dto["filters"] || {};
        const roleId = filters.roleId;
        const search = filters.search;
        try {
            const academicYear = await this.checkIfActiveYear(
                academicYearId,
                tenantId
                );
            if (!academicYear[0]?.isActive) {
                return APIResponse.error(
                response,
                'api.add.cohortMembers',
                HttpStatus.NOT_FOUND.toLocaleString(),
                API_RESPONSES.ACADEMICYEAR_NOT_FOUND,
                HttpStatus.NOT_FOUND
                );
            }

            const cohortExists = await this.isCohortExistForYear(
                academicYearId,
                dto.cohortId
                );
            if (cohortExists.length === 0) {
                return APIResponse.error(
                response,
                'api.add.cohortMembers',
                HttpStatus.NOT_FOUND.toLocaleString(),
                API_RESPONSES.COHORTID_NOTFOUND_FOT_THIS_YEAR(dto.cohortId),
                HttpStatus.NOT_FOUND
                );
            }

     
            // const query = this.getFilterQuery(cohortId, academicYearId, search, roleId, filters)

            // // Explicitly select columns
            // query.select([
            // 'user.userId',
            // 'user.name',
            // 'user.email',
            // ]);
            
            // const [sql, params] = query.getQueryAndParameters();
            // console.log('Generated SQL:', sql);
            // console.log('Parameters:', params);
            // const [results, total] = await query
            // .setParameters({
            //     status: 'active',
            //     roleId,
            //     cohortId,
            //     academicYearId,
            //     classId: filters.classId,
            //     schoolId: filters.schoolId,
            //     clusterId: filters.clusterId ? String(filters.clusterId) : undefined,
            // })
            // .orderBy('user.name', 'ASC')
            // .skip(offset)
            // .take(limit)
            // .getManyAndCount();

            const { sql, params } =  this.buildEligibleUsersRawSql('select',
                filters,
                academicYearId,
                cohortId
            );
            console.log('Generated SQL:', sql);
            console.log('Parameters:', params);
            const { sql: countSql, params: countParams } = this.buildEligibleUsersRawSql(
                'count',
                filters,
                academicYearId,
                cohortId,
                offset,
                limit
            );
            
            const results = await this.dataSource.query(sql, params);
            const countResult = await this.dataSource.query(countSql, countParams);
            const total = countResult[0]?.total || 0;


            return await APIResponse.success(
            response,
            'api.get.eligibleUsers',
            { results, total },
            HttpStatus.OK,
            API_RESPONSES.RESET_PASSWORD_LINK_SUCCESS
            );
        } catch (error) {
            return await APIResponse.error(
            response,
            'api.get.eligibleUsers',
            error,
            `Error : ${error.message}`,
            500
            );
        }
    }

    // Helper to build the WHERE clause and params array
    buildEligibleUsersRawSql(query = 'count', filters, academicYearId, cohortId, offset=0, limit=100) {
        let whereClauses = [
            `"user"."status" = $1`,         // $1: 'active'
            `"urm"."roleId" = $2`,          // $2: roleId
        ];

        let params = [
            'active',           // $1
            filters.roleId,             // $2
            academicYearId,     // $3
        ];

       let paramIdx = 4;
       if (filters.classId || filters.schoolId || filters.clusterId) {
            whereClauses[2] = 
            `"user"."userId" IN (
                SELECT DISTINCT cm."userId"
                FROM "CohortMembers" cm
                INNER JOIN "Cohort" c ON c."cohortId" = cm."cohortId"
                INNER JOIN "CohortAcademicYear" cay ON cay."cohortAcademicYearId" = cm."cohortAcademicYearId"
                WHERE cay."academicYearId" = $3`
            
                if (filters.classId) {
                    whereClauses[2] += ` AND cm."cohortId" = $${paramIdx}`;
                    params.push(filters.classId);
                    paramIdx++;
                }
                if (filters.schoolId) {
                    whereClauses[2] += ` AND c."parentId" = $${paramIdx}`;
                    params.push(filters.schoolId);
                    paramIdx++;
                }
                if (filters.clusterId) {
                    whereClauses[2] += ` AND c."parentId" IN (
                        SELECT s."cohortId"::varchar
                        FROM "Cohort" s
                        WHERE s."parentId" = $${paramIdx}
                    )`;
                    params.push(String(filters.clusterId));
                    paramIdx++;
                }
                whereClauses[2] += ')'; // close the IN subquery
        }
        whereClauses.push(`"user"."userId" NOT IN (
            SELECT cm."userId"
            FROM "CohortMembers" cm
            INNER JOIN "CohortAcademicYear" cay ON cay."cohortAcademicYearId" = cm."cohortAcademicYearId"
            WHERE cm."cohortId" = $${paramIdx}
            AND cay."academicYearId" = $3
        )`);
        params.push(cohortId);
        paramIdx++;

        if (filters.search) {
            whereClauses.push(`"user"."name" ILIKE $${paramIdx}`);
            params.push(`%${filters.search}%`);
            paramIdx++;
        }
        if (query === 'count') {
            return {
                sql: `
                    SELECT COUNT(*)::int AS total
                    FROM "Users" "user"
                    INNER JOIN "UserRolesMapping" "urm" ON "urm"."userId" = "user"."userId"
                    WHERE ${whereClauses.join('\n  AND ')}
                `,
                params
            };
        } else if (query === 'select') {
            return {
                sql: `
                    SELECT "user"."userId", "user"."name", "user"."email"
                    FROM "Users" "user"
                    INNER JOIN "UserRolesMapping" "urm" ON "urm"."userId" = "user"."userId"
                    WHERE ${whereClauses.join('\n  AND ')}
                    ORDER BY "user"."name" ASC
                    OFFSET $${paramIdx} LIMIT $${paramIdx + 1}
                `,
                params: [...params, offset, limit]
            };
        } else
        {
            return {
                sql: `
                    SELECT "user"."userId"
                    FROM "Users" "user"
                    INNER JOIN "UserRolesMapping" "urm" ON "urm"."userId" = "user"."userId"
                    WHERE ${whereClauses.join('\n  AND ')}
                `,
                params
            };
        }        
    }
}
