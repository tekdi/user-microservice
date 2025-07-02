import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { API_RESPONSES } from "@utils/response.messages";
import { AcademicYearDto } from "src/academicyears/dto/academicyears-create.dto";

@Injectable()
export class DateValidationPipe implements PipeTransform {
  transform(academicYearDto: AcademicYearDto) {
    const startDate = this.getDateOnly(new Date(academicYearDto.startDate));
    const endDate = this.getDateOnly(new Date(academicYearDto.endDate));
    const currentDate = this.getDateOnly(new Date());

    if (startDate < currentDate) {
      throw new BadRequestException(API_RESPONSES.STARTDATE_VALIDATION);
    }

    if (endDate <= startDate) {
      throw new BadRequestException(API_RESPONSES.ENDDATE_VALIDATION);
    }
    return academicYearDto;
  }

  private getDateOnly(date: Date | string): string {
    return new Date(date).toISOString().split("T")[0];
  }
}
