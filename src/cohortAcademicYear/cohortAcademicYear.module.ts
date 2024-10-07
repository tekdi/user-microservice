import { Module } from '@nestjs/common';
import { CohortAcademicYearService } from '../adapters/postgres/cohortAcademicYear-adapter';
// import { CohortAcademicYearController } from './cohortAcademicYear.controller';

@Module({
    imports: [],
    // controllers: [CohortAcademicYearController],
    providers: [CohortAcademicYearService],
})
export class CohortAcademicYearModule {}