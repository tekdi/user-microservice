import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";
import { Response } from "express";

export interface IServicelocatorAcademicyear {
    createAcademicYear(academicYearDto: AcademicYearDto, tenantId, response: Response): Promise<any>;
}
