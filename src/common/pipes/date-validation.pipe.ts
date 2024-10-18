import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { API_RESPONSES } from "@utils/response.messages";
import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";

@Injectable()
export class DateValidationPipe implements PipeTransform {
  transform(academicYearDto: AcademicYearDto) {
    const startDate = new Date(academicYearDto.startDate);
    const endDate = new Date(academicYearDto.endDate);
    const currentDate = new Date();

    if (startDate < currentDate) {
      throw new BadRequestException(API_RESPONSES.STARTDATE_VALIDATION);
    }

    if (endDate < startDate) {
      throw new BadRequestException(API_RESPONSES.ENDDATE_VALIDATION);
    }
    return academicYearDto;
  }
}
