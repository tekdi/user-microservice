import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";
import { Response } from "express";
import { AcademicYearSearchDto } from "src/academicyears/dto/academicyears-search.dto";

export interface IServicelocatorAcademicyear {
  createAcademicYear(
    academicYearDto: AcademicYearDto,
    userId,
    tenantId,
    response: Response
  ): Promise<any>;
  getActiveAcademicYear(academicYearId: string, tenantId: string);
  getAcademicYearList(
    academicYearSearchDto: AcademicYearSearchDto,
    userId,
    tenantId,
    response: Response
  );
  getAcademicYearById(id, userId, response: Response);
}
