import { User } from '../../user/entities/user-entity';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from "@nestjs/typeorm";
import { AttendanceEntity } from "../../attendance/entities/attendance.entity";
import { Repository, Between, In, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import { ConsoleLogger, HttpStatus, Injectable } from "@nestjs/common";
import { AttendanceSearchDto } from "../../attendance/dto/attendance-search.dto";
import { SuccessResponse } from 'src/success-response';
import { AttendanceDto, BulkAttendanceDTO } from '../../attendance/dto/attendance.dto';
import { AttendanceDateDto } from '../../attendance/dto/attendance-date.dto';
import { AttendanceStatsDto } from '../../attendance/dto/attendance-stats.dto';
import { ErrorResponseTypeOrm } from 'src/error-response-typeorm';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
const moment = require('moment');
const facetedSearch = require("in-memory-faceted-search");

@Injectable()
export class PostgresAttendanceService {
    constructor(private configService: ConfigService,
        @InjectRepository(AttendanceEntity)
        private attendanceRepository: Repository<AttendanceEntity>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(CohortMembers)
        private cohortMembersRepository: Repository<CohortMembers>
    ) { }



    /*
    Method to search attendance for all or for the key value pair provided in filter object 
    @body an object of details consisting of attendance details of user (attendance dto)  
    @return Attendance records from attendance table for provided filters
    */

    async searchAttendance(tenantId: string, request: any, attendanceSearchDto: AttendanceSearchDto) {
        try {
            let { limit, offset, filters, facets, sort } = attendanceSearchDto;
            // Set default limit 0 and offset 20 if not provided
            limit = limit ? limit : 20;
            offset = offset ? offset : 0;

            // Get column names from metadata
            const attendanceKeys = this.attendanceRepository.metadata.columns.map((column) => column.propertyName);

            let whereClause: any = { tenantId };
            // Default WHERE clause for filtering by tenantId

            if (filters && Object.keys(filters).length > 0) {
                for (const [key, value] of Object.entries(filters)) {
                    if (attendanceKeys.includes(key)) {
                        if (key === "attendanceDate") {
                            // For attendanceDate, consider NULL values as well
                            whereClause[key] = In([value, null]);
                        } else {
                            whereClause[key] = value;
                        }
                    } else if (filters.fromDate && filters.toDate) {
                        // Convert fromDate and toDate strings to Date objects
                        const fromDate = new Date(filters.fromDate);
                        const toDate = new Date(filters.toDate);

                        // Construct the whereClause with the date range using Between
                        whereClause["attendanceDate"] = Between(fromDate, toDate);
                    } else {
                        // If filter key is invalid, return a BadRequest response
                        return new ErrorResponseTypeOrm({
                            statusCode: HttpStatus.BAD_REQUEST,
                            errorMessage: `${key} Invalid filter key`,
                        });
                    }
                }
            }

            let attendanceList;

            if (!facets) {
                let orderOption: any = {};
                if (sort && Array.isArray(sort) && sort.length === 2) {
                    const [column, order] = sort;
                    if (attendanceKeys.includes(column)) {
                        orderOption[column] = order.toUpperCase();;
                    } else {
                        // If sort key is invalid, return a BadRequest response
                        return new ErrorResponseTypeOrm({
                            statusCode: HttpStatus.BAD_REQUEST,
                            errorMessage: `${column} Invalid sort key`,
                        });
                    }
                }

                attendanceList = await this.attendanceRepository.find({
                    where: whereClause,
                    order: orderOption, // Apply sorting option
                });
                const paginatedAttendanceList = attendanceList.slice(offset, offset + (limit));
                return new SuccessResponse({
                    statusCode: HttpStatus.OK,
                    message: 'Ok.',
                    data: {
                        attendanceList: paginatedAttendanceList
                    },
                });
            }

            if (facets && facets.length > 0) {
                attendanceList = await this.attendanceRepository.find({
                    where: whereClause // Apply sorting option
                });

                let facetFields = [];
                // Check for invalid facets
                for (const facet of facets) {
                    if (!attendanceKeys.includes(facet)) {
                        // If facet is not present in attendanceKeys, return a BadRequest response
                        return new ErrorResponseTypeOrm({
                            statusCode: HttpStatus.BAD_REQUEST,
                            errorMessage: `${facet} Invalid facet`,
                        });
                    }
                    facetFields.push({ name: facet, field: facet });
                }

                let result = {};
                // Process the data to calculate counts based on facets
                for (const facet of facetFields) {
                    const { field } = facet;
                    const tree = await this.facetedSearch({ data: attendanceList, facets: [facet], sort });

                    if (tree instanceof ErrorResponseTypeOrm) {
                        return tree
                    }
                    result[field] = tree[field];
                }

                // Return success response with counts
                return new SuccessResponse({
                    statusCode: HttpStatus.OK,
                    message: 'Ok.',
                    data: {
                        result: result,
                    },
                });
            }

        } catch (error) {
            if (error.code === "22P02") {
                // Handle invalid input value error
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.BAD_REQUEST,
                    errorMessage: `Invalid value entered for ${error.routine}`,
                });
            }
            // Handle other errors with internal server error response
            return new ErrorResponseTypeOrm({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                errorMessage: error, // Use error message if available
            });
        }
    }


    async facetedSearch({ data, facets, sort }) {
        const tree = {};
        const attendanceKeys = new Set<string>();

        // Populate attendanceKeys with distinct attendance values
        data.forEach(item => {
            const attendanceValue = item.attendance;
            if (attendanceValue) {
                attendanceKeys.add(attendanceValue);
            }
        });

        // Iterate over facets
        for (const facet of facets) {
            const { field } = facet;

            // Initialize main facet in tree
            tree[field] = {};

            // Iterate over data to count occurrences of each field value
            for (const item of data) {
                const value = item[field];
                const attendanceValue = item["attendance"];

                // If contextId doesn't exist in the tree, initialize it with an empty object
                if (!tree[field][value]) {
                    tree[field][value] = {};
                }

                // Increment count for attendanceValue
                if (!tree[field][value][attendanceValue]) {
                    tree[field][value][attendanceValue] = 1;
                } else {
                    tree[field][value][attendanceValue]++;
                }
            }

            // Calculate percentage for each value
            for (const value in tree[field]) {
                const counts = tree[field][value];
                const totalCount = Object.values(counts).reduce((acc: number, curr: unknown) => acc + (curr as number), 0);

                for (const key in counts) {
                    const count = counts[key];
                    const percentage = (count / Number(totalCount)) * 100; // Convert totalCount to a number
                    counts[key + "_percentage"] = percentage.toFixed(2); // Round percentage to two decimal places
                }
            }

            // Assign default values for sorting
            for (const value in tree[field]) {
                for (const attendanceValue of attendanceKeys) {
                    const percentageKey = `${attendanceValue}_percentage`;
                    if (!tree[field][value].hasOwnProperty(percentageKey)) {
                        tree[field][value][percentageKey] = "0.00"; // Set default value internally
                    }
                }
            }

            // Validate sort keys
            if (sort) {
                const [sortField, sortOrder] = sort;
                if (!attendanceKeys.has(sortField.replace("_percentage", "")) && sortField !== 'present_percentage' && sortField !== 'absent_percentage') {
                    return new ErrorResponseTypeOrm({
                        statusCode: HttpStatus.BAD_REQUEST,
                        errorMessage: `Invalid sort[0]: ${sortField}`,
                    });
                }

                // Sort the tree based on the provided sort parameter
                tree[field] = await this.sortTree(tree[field], sortField, sortOrder);
            }
        }

        // Remove default values from the response
        for (const field in tree) {
            for (const value in tree[field]) {
                for (const attendanceValue of attendanceKeys) {
                    const percentageKey = `${attendanceValue}_percentage`;
                    if (tree[field][value][percentageKey] === "0.00") {
                        delete tree[field][value][percentageKey]; // Remove default value from response
                    }
                }
            }
        }

        return tree;
    }

    // Helper function to sort the tree based on the provided sortField and sortOrder
    async sortTree(tree, sortField, sortOrder) {
        const sortedTree = {};

        // Convert the object keys (values of the sortField) into an array
        const keys = Object.keys(tree);

        // Sort the keys based on the sortField and sortOrder
        keys.sort((a, b) => {
            const valueA = parseFloat(tree[a][sortField] || "0.00"); // Convert string to float
            const valueB = parseFloat(tree[b][sortField] || "0.00"); // Convert string to float

            if (sortOrder === 'asc') {
                return valueA - valueB;
            } else {
                return valueB - valueA;
            }
        });

        // Populate the sortedTree with sorted data
        keys.forEach(key => {
            sortedTree[key] = tree[key];
        });

        return sortedTree;
    }













    async attendanceReport(attendanceStatsDto: AttendanceStatsDto) {
        let { contextId, limit, offset, filters } = attendanceStatsDto;
        try {

            let nameFilter = '';
            let userFilter = '';
            let dateFilter = '';
            let queryParams: any[] = [contextId];
            let subqueryParams: any[] = [contextId]; // Initialize query parameters array
            let paramIndex = 1; // Initialize parameter index

            if (filters && filters.search) {
                nameFilter = `AND u."name" ILIKE $${++paramIndex}`; // Increment paramIndex
                queryParams.push(`%${filters.search.trim()}%`);
                subqueryParams.push(`%${filters.search.trim()}%`);
            }
            if (filters && filters.userId) {
                userFilter = ` AND u."userId" = $${++paramIndex}`; // Increment paramIndex
                queryParams.push(filters.userId.trim());
                subqueryParams.push(filters.userId.trim());

            }
            if (filters && filters.fromDate && filters.toDate) {
                dateFilter = `WHERE aa."attendanceDate" >= $${++paramIndex} AND aa."attendanceDate" <= $${++paramIndex}`;
                queryParams.push(filters.fromDate);
                queryParams.push(filters.toDate);
                subqueryParams.push(filters.fromDate);
                subqueryParams.push(filters.toDate);
            }


            let query = `
                SELECT 
                    u."userId",
                    u."name",
                    CASE 
                        WHEN aa_stats."total_attendance" = 0 THEN '-'
                        ELSE ROUND((aa_stats."present_count" * 100.0) / aa_stats."total_attendance", 0)::text
                    END AS attendance_percentage
                FROM 
                    public."Users" AS u  
                INNER JOIN 
                    public."CohortMembers" AS cm ON cm."userId" = u."userId"
                LEFT JOIN 
                    (
                        SELECT 
                            aa."userId",
                            COUNT(*) AS "total_attendance",
                            COUNT(CASE WHEN aa."attendance" = 'present' THEN 1 END) AS "present_count"
                        FROM 
                            public."Attendance" AS aa
                        ${dateFilter} 
                        GROUP BY 
                            aa."userId"
                    ) AS aa_stats ON cm."userId" = aa_stats."userId"
                WHERE 
                    cm."cohortId" = $1 
                    AND cm."role" = 'student'
                    ${nameFilter}
                    ${userFilter}
                GROUP BY 
                    u."userId", u."name", aa_stats."total_attendance", aa_stats."present_count"
            `;

            if (filters) {
                if (filters.nameOrder && (filters.nameOrder === "asc" || filters.nameOrder === "desc")) {
                    query += ` ORDER BY "name" ${filters.nameOrder}`;
                } else if (filters.percentageOrder && (filters.percentageOrder === "asc" || filters.percentageOrder === "desc")) {
                    query += ` ORDER BY attendance_percentage ${filters.percentageOrder}`;
                }
            }
            query += `
                LIMIT $${++paramIndex}
                OFFSET $${++paramIndex}`;

            queryParams.push(limit);
            queryParams.push(offset);



            const result = await this.attendanceRepository.query(query, queryParams);

            if (!filters || !filters?.userId) {
                // We don't need average for single user
                const countquery = `
                    SELECT ROUND(AVG(attendance_percentage::NUMERIC), 2) AS average_attendance_percentage
                    FROM (
                        SELECT 
                            u."userId",
                            u."name",
                            CASE 
                                WHEN aa_stats."total_attendance" = 0 THEN '-'
                                ELSE ROUND((aa_stats."present_count" * 100.0) / aa_stats."total_attendance", 0)::text
                            END AS attendance_percentage
                        FROM 
                            public."Users" AS u  
                        INNER JOIN 
                            public."CohortMembers" AS cm ON cm."userId" = u."userId"
                        LEFT JOIN 
                            (
                                SELECT 
                                    aa."userId",
                                    COUNT(*) AS "total_attendance",
                                    COUNT(CASE WHEN aa."attendance" = 'present' THEN 1 END) AS "present_count"
                                FROM 
                                    public."Attendance" AS aa
                                ${dateFilter} 
                                GROUP BY 
                                    aa."userId"
                            ) AS aa_stats ON cm."userId" = aa_stats."userId"
                        WHERE 
                            cm."cohortId" = $1 
                            AND cm."role" = 'student'
                            ${nameFilter}
                            ${userFilter}
                        GROUP BY 
                            u."userId", u."name", aa_stats."total_attendance", aa_stats."present_count"
                    ) AS subquery`;


                const average = await this.attendanceRepository.query(countquery, subqueryParams);
                const report = await this.mapResponseforReport(result);
                const response = {
                    report,
                    average: average[0]
                };
                return new SuccessResponse({
                    statusCode: HttpStatus.OK,
                    message: "Ok.",
                    data: response
                });
            } else {

                const response = await this.mapResponseforReport(result);
                return new SuccessResponse({
                    statusCode: HttpStatus.OK,
                    message: "Ok.",
                    data: response
                });
            }


        } catch (error) {
            return new ErrorResponseTypeOrm({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                errorMessage: error
            });
        }
    }








    public async mappedResponse(result: any) {
        const attendanceResponse = result.map((item: any) => {

            const dateObject = new Date(item.attendanceDate);
            const formattedDate = moment(dateObject).format('YYYY-MM-DD'); const attendanceMapping = {
                tenantId: item?.tenantId ? `${item.tenantId}` : "",
                attendanceId: item?.attendanceId ? `${item.attendanceId}` : "",
                userId: item?.userId ? `${item.userId}` : "",
                attendanceDate: item.attendanceDate ? formattedDate : null,
                attendance: item?.attendance ? `${item.attendance}` : "",
                remark: item?.remark ? `${item.remark}` : "",
                latitude: item?.latitude ? item.latitude : 0,
                longitude: item?.longitude ? item.longitude : 0,
                image: item?.image ? `${item.image}` : "",
                metaData: item?.metaData ? item.metaData : [],
                syncTime: item?.syncTime ? `${item.syncTime}` : "",
                session: item?.session ? `${item.session}` : "",
                contextId: item?.contextId ? `${item.contextId}` : "",
                contextType: item?.contextType ? `${item.contextType}` : "",
                createdAt: item?.createdAt ? `${item.createdAt}` : "",
                updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
                createdBy: item?.createdBy ? `${item.createdBy}` : "",
                updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
                username: item?.username ? `${item.username}` : "",
                role: item?.role ? `${item.role}` : "",

            };


            return new AttendanceDto(attendanceMapping);
        });

        return attendanceResponse;
    }

    public async mapResponseforReport(result: any) {
        const attendanceReport = result.map((item: any) => {
            const attendanceReportMapping = {
                name: item?.name ? `${item.name}` : "",
                userId: item?.userId ? `${item.userId}` : "",
                attendance_percentage: item?.attendance_percentage ? `${item.attendance_percentage}` : "",
            };

            return new AttendanceStatsDto(attendanceReportMapping);
        });

        return attendanceReport;
    }

    public async mapAttendanceRecord(result: any) {
        const attendanceRecords = result.map((item: any) => {
            const dateObject = new Date(item.attendanceDate);
            const formattedDate = moment(dateObject).format('YYYY-MM-DD');

            let attendance = {
                name: item?.name ? `${item.name}` : "",
                userId: item?.userId ? `${item.userId}` : "",
                attendance: item?.attendance ? `${item.attendance}` : "",
                attendanceDate: item.attendanceDate ? formattedDate : null

            };
            return new AttendanceStatsDto(attendance);
        });

        return attendanceRecords;
    }
    /* 
    Method to create,update or add attendance for valid user in attendance table
    @body an object of details consisting of attendance details of user (attendance dto)  
    @return updated details of attendance record 
    */

    public async updateAttendanceRecord(
        loginUserId,
        attendanceDto: AttendanceDto
    ) {


        try {

            const Isvalid = await this.validateUserForCohort(attendanceDto.userId, attendanceDto.contextId)
            if (!Isvalid) {

                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.BAD_REQUEST,
                    errorMessage: "Invalid combination of contextId and userId",
                });

            }

            const attendanceToSearch = new AttendanceSearchDto({});

            attendanceToSearch.filters = {
                attendanceDate: attendanceDto.attendanceDate,
                userId: attendanceDto.userId,
            };

            const attendanceFound: any = await this.searchAttendance(
                attendanceDto.tenantId,
                loginUserId,
                attendanceToSearch
            );

            if (attendanceFound instanceof ErrorResponseTypeOrm) {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    errorMessage: attendanceFound?.errorMessage,
                });
            }

            if (
                attendanceFound.data.attendanceList.length > 0
            ) {

                attendanceDto.updatedBy = loginUserId
                return await this.updateAttendance(
                    attendanceFound.data.attendanceList[0].attendanceId,
                    loginUserId,
                    attendanceDto
                );
            } else {
                if (!attendanceDto.scope) {
                    attendanceDto.scope = "student"
                }
                attendanceDto.createdBy = loginUserId;
                attendanceDto.updatedBy = loginUserId;
                return await this.createAttendance(loginUserId, attendanceDto);
            }
        } catch (e) {
            return new ErrorResponseTypeOrm({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                errorMessage: e,
            });
        }
    }

    /*Method to update attendance for userId 
    @body an object of details consisting of attendance details of user (attendance dto),attendanceId
    @return updated attendance record based on attendanceId
    */
    public async updateAttendance(
        attendanceId: string,
        request: any,
        attendanceDto: AttendanceDto
    ) {
        try {


            const attendanceRecord = await this.attendanceRepository.findOne({
                where: { attendanceId },
            });


            if (!attendanceRecord) {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.BAD_REQUEST,
                    errorMessage: "Attendance record not found",
                });
            }

            this.attendanceRepository.merge(attendanceRecord, attendanceDto);

            // Save the updated attendance record
            const updatedAttendanceRecord = await this.attendanceRepository.save(
                attendanceRecord
            );

            return new SuccessResponse({
                statusCode: HttpStatus.OK,
                message: "Attendance record updated successfully",
                data: updatedAttendanceRecord,
            });
        } catch (error) {

            if (error.code == '23503') {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.BAD_REQUEST,
                    errorMessage: "Please provide valid contextId",
                });
            }
            else {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    errorMessage: error,

                })
            }

        }
    }

    /*method to add attendance of new user in attendance
    @body object containing details related to attendance details (AttendanceDto)
    @return attendance record for newly added user in Attendance table 
    */
    public async createAttendance(request: any, attendanceDto: AttendanceDto) {

        try {
            const attendance = this.attendanceRepository.create(attendanceDto);
            const result = await this.attendanceRepository.save(attendance);

            return new SuccessResponse({
                statusCode: HttpStatus.CREATED,
                message: "Attendance created successfully.",
                data: result,
            });
        } catch (error) {

            if (error.code == '23503') {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.BAD_REQUEST,
                    errorMessage: "Please enter valid UserId and contextId",
                });
            } else {
                return new ErrorResponseTypeOrm({
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    errorMessage: error,
                });
            }
        }
    }

    /*Method to search attendance fromDate to toDate 
    @body object containing attendance date details for user (AttendanceDateDto)
    @return attendance records from fromDate to toDate     */

    public async attendanceByDate(
        tenantId: string,
        request: any,
        attendanceSearchDto: AttendanceDateDto
    ) {
        try {
            let { limit, offset } = attendanceSearchDto;
            limit = limit ? limit : 0;
            offset = offset ? offset : 0;

            const fromDate = new Date(attendanceSearchDto.fromDate);
            const toDate = new Date(attendanceSearchDto.toDate);

            let whereClause: any = {
                tenantId: tenantId ? tenantId : '',
                attendanceDate: Between(fromDate, toDate),
            };

            // Add additional filters if present
            if (attendanceSearchDto.filters) {
                Object.keys(attendanceSearchDto.filters).forEach((key) => {
                    whereClause[key] = attendanceSearchDto.filters[key];
                });
            }

            const [results, totalCount] = await this.attendanceRepository.findAndCount({
                where: whereClause,
                take: limit,
                skip: offset,
            });

            const mappedResponse = await this.mappedResponse(results);

            return new SuccessResponse({
                statusCode: HttpStatus.OK,
                message: "Ok",
                totalCount: totalCount,
                data: mappedResponse,
            });
        } catch (e) {
            return new ErrorResponseTypeOrm({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                errorMessage: e,
            });
        }
    }

    /*Method to add multiple attendance records in Attendance table
    @body Array of objects containing attendance details of user (AttendanceDto)
    */

    public async multipleAttendance(
        tenantId: string,
        request: any,
        attendanceData: BulkAttendanceDTO
    ) {

        const loginUserId = request.user.userId


        const responses = [];
        const errors = [];
        try {
            let count = 1;

            for (let attendance of attendanceData.userAttendance) {


                const userAttendance = new AttendanceDto({
                    attendanceDate: attendanceData.attendanceDate,
                    contextId: attendanceData?.contextId,
                    scope: attendanceData?.scope,
                    attendance: attendance?.attendance,
                    userId: attendance?.userId,
                    tenantId: tenantId,
                    remark: attendance?.remark,
                    latitude: attendance?.latitude,
                    longitude: attendance?.longitude,
                    image: attendance?.image,
                    metaData: attendance?.metaData,
                    syncTime: attendance?.syncTime,
                    session: attendance?.session,
                    contextType: attendance?.contextType,
                })

                const attendanceRes: any = await this.updateAttendanceRecord(
                    loginUserId,
                    userAttendance
                );

                if (attendanceRes?.statusCode === 200 || attendanceRes?.statusCode === 201) {
                    responses.push(attendanceRes.data);
                }
                else {
                    errors.push({
                        userId: attendance.userId,
                        attendanceRes,
                    });
                }
                count++;


            }
        } catch (e) {
            return new ErrorResponseTypeOrm({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                errorMessage: e,
            });
        }


        return {
            statusCode: HttpStatus.OK,
            totalCount: attendanceData.userAttendance.length,
            successCount: responses.length,
            errorCount: errors.length,
            responses,
            errors,
        };
    }



    public async validateUserForCohort(userId, cohortId) {
        const attendanceRecord = await this.cohortMembersRepository.findOne({
            where: { userId, cohortId } // Include cohortId in the where clause
        });
        if (attendanceRecord) {
            return true
        } else {
            return false
        }

    }

}




