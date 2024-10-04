import {
    PipeTransform,
    Injectable,
    BadRequestException,
} from '@nestjs/common';
import { AcademicYearDto } from 'src/academicyears/dto/academicyears-create.dto';

@Injectable()
export class DateValidationPipe implements PipeTransform {
    transform(academicYearDto: AcademicYearDto) {
        const startDate = new Date(academicYearDto.startDate);
        const endDate = new Date(academicYearDto.endDate);
        const currentDate = new Date();

        if (startDate < currentDate) {
            throw new BadRequestException('start Date should not less than current date')
        }

        if (endDate < startDate) {
            throw new BadRequestException('End Date shluld not less than startDate')
        }
        return academicYearDto;
    }
}