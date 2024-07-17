import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDate, IsNotEmpty, Matches, Validate, ValidateIf, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";
import { isAfter, isBefore, isSameDay } from "date-fns";


@ValidatorConstraint({ name: 'isNotAfterFromDate', async: false })
export class IsFromDateBeforeToDateConstraint implements ValidatorConstraintInterface {
  validate(fromDate: Date, args: ValidationArguments) {
    const toDate = args.object[args.constraints[0]];
    const res = isSameDay(fromDate, toDate) || isBefore(fromDate, toDate);
    return res
  }

  defaultMessage(args: ValidationArguments) {
    return 'From Date must be before or equal to To Date';
  }
}


export class AttendanceDateDto {
  @ApiProperty({
    type: Date,
    description: "From Date",
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Please provide a valid date in the format yyyy-mm-dd' })
  @Validate(IsFromDateBeforeToDateConstraint, ['toDate'])
  fromDate: Date;

  @ApiProperty({
    type: Date,
    description: "To Date",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Please provide a valid date in the format yyyy-mm-dd' })
  @IsNotEmpty()
  toDate: Date;

  @ApiProperty({
    type: Number,
    description: "Limit",
  })
  limit: number;

  @ApiProperty({
    type: Number,
    description: "number",
  })
  offset: number;

  @ApiProperty({
    type: Object,
    description: "Filters",
  })
  @ApiPropertyOptional()
  filters: object;

  constructor(partial: Partial<AttendanceDateDto>) {
    Object.assign(this, partial);
  }
}
