import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { isBefore, isSameDay } from "date-fns";
enum Order {
  ASC = "asc",
  DESC = "desc",
}

@ValidatorConstraint({ name: "isNotAfterFromDate", async: false })
export class IsFromDateBeforeToDateConstraint
  implements ValidatorConstraintInterface
{
  validate(fromDate: Date, args: ValidationArguments) {
    const toDate = args.object[args.constraints[0]];
    const res = isSameDay(fromDate, toDate) || isBefore(fromDate, toDate);
    return res;
  }

  defaultMessage(args: ValidationArguments) {
    return "From Date must be before or equal to To Date";
  }
}

class FiltersDto {
  @IsEnum(Order, {
    message: "nameOrder must be a valid enum value asc or desc",
  })
  @IsOptional()
  @ApiPropertyOptional()
  nameOrder: Order;

  @IsEnum(Order, {
    message: "nameOrder must be a valid enum value asc or desc",
  })
  @IsOptional()
  @ApiPropertyOptional()
  percentageOrder: Order;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  search: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  userId: string;

  @ApiPropertyOptional({
    type: Date,
    description: "From Date",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Please provide a valid date in the format yyyy-mm-dd",
  })
  @Validate(IsFromDateBeforeToDateConstraint, ["toDate"])
  fromDate: Date;

  @IsOptional()
  @ApiProperty({
    type: Date,
    description: "To Date",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Please provide a valid date in the format yyyy-mm-dd",
  })
  toDate: Date;
}

export class AttendanceStatsDto {
  @Expose()
  name: string;

  @ApiProperty({
    type: String,
    description: "The name of the person",
  })
  @IsNotEmpty()
  @IsUUID()
  @Expose()
  contextId: string;

  @Expose()
  attendance_percentage: string;

  @Expose()
  userId: string;

  @Expose()
  attendanceDate: Date;

  @Expose()
  attendance: string;

  @ApiProperty({
    type: Number,
    description: "limit",
  })
  @IsNotEmpty()
  @Expose()
  limit: number;

  @ApiPropertyOptional({
    type: Number,
    description: "offset",
  })
  @Expose()
  offset: number;

  @ApiProperty({
    type: FiltersDto,
    description: "Filters",
  })
  @ApiPropertyOptional()
  @ValidateNested({ each: true })
  @Type(() => FiltersDto)
  filters: FiltersDto;

  constructor(obj: Partial<AttendanceStatsDto>) {
    Object.assign(this, obj);
  }
}
