import { CohortAcademicYearDto } from "src/cohortAcademicYear/dto/cohort-academicyear.dto";
import { Request, Response } from "express";

export interface IServiceLocatorCohortAcademicYear {
    createCohortAcademicYear(
        tenantId: string,
        request: Request,
        cohortAcademicYearDto: CohortAcademicYearDto,
        response: Response
    );
}