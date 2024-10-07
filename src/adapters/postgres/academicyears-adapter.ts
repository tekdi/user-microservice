import { HttpStatus, Injectable } from "@nestjs/common";
import { Response } from "express";
import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";
import { IServicelocatorAcademicyear } from "../academicyearsservicelocater";
import { InjectRepository } from "@nestjs/typeorm";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { Repository } from "typeorm";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import APIResponse from "src/common/responses/response";

@Injectable()
export class PostgresAcademicYearService implements IServicelocatorAcademicyear {
    constructor(
        @InjectRepository(AcademicYear)
        private readonly academicYearRespository: Repository<AcademicYear>
    ) { }

    public async createAcademicYear(academicYearDto: AcademicYearDto, tenantId, response: Response): Promise<any> {
        const apiId = APIID.ACADEMICYEAR_CREATE;
        try {
            const startSessionYear = new Date(academicYearDto.startDate).getFullYear();
            const endSessionYear = new Date(academicYearDto.endDate).getFullYear();
            academicYearDto.session = `${startSessionYear}-${endSessionYear}`
            academicYearDto.tenantId = tenantId

            // session session alread exist or not
            const checkResult = await this.isExistSessionWithTenant(academicYearDto, tenantId)
            if (checkResult) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.ACADEMICYEAR_YEAR,
                    API_RESPONSES.ACADEMICYEAR_EXIST,
                    HttpStatus.BAD_REQUEST
                );
            }

            // false last record which is active now 
            const getCurrentActiveYear = await this.academicYearRespository.findOne({ where: { isActive: true, tenantId: tenantId } })
            if (getCurrentActiveYear) {
                const updateStatus = await this.academicYearRespository.update({ id: getCurrentActiveYear.id }, { isActive: false })
            }
            //save record
            const saveAcademicYear = await this.academicYearRespository.save(academicYearDto);
            return APIResponse.success(
                response,
                apiId,
                saveAcademicYear,
                HttpStatus.CREATED,
                API_RESPONSES.ACADEMICYEAR
            );
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async isExistSessionWithTenant(academicYearDto, tenantId) {
        const startDate = academicYearDto.startDate;
        const endDate = academicYearDto.endDate;
        const overlappingSession = await this.academicYearRespository
            .createQueryBuilder('academicYear')
            .where('academicYear.tenantId = :tenantId', { tenantId })
            .andWhere('academicYear.isActive = true')
            .andWhere(
                '(academicYear.startDate <= :endDate AND academicYear.endDate >= :startDate)',
                { startDate, endDate },
            )
            .getOne();
        if (overlappingSession) {
            return true
        }
        return false;
    }
}
