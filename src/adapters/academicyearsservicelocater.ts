import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";
import { Response } from "express";
import { AcademicYearSearchDto } from "src/academicyears/dto/academicyears-search.dto";

export interface IServicelocatorAcademicyear {
    createAcademicYear(academicYearDto: AcademicYearDto, tenantId, response: Response): Promise<any>;
    getAcademicYearList(academicYearSearchDto: AcademicYearSearchDto, tenantId, response: Response)
    getAcademicYearById(id, response: Response)
}
