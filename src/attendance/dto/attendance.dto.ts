import { ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IsDate, IsDateString, IsDefined, IsEnum, IsUUID, Matches, Validate, ValidateIf, ValidateNested, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsObject } from 'class-validator';
import { User } from 'src/user/entities/user-entity';
import { addHours, format, isAfter, isBefore, isValid } from 'date-fns'; // Import isAfter function from date-fns
import { HttpException, HttpStatus } from '@nestjs/common';
import { Cohort } from 'src/cohort/entities/cohort.entity';

//for student valid enum are[present,absent]
//for teacher valid enum are[present,on-leave,half-day]
enum Attendance {
  present = "present",
  absent = "absent",
  onLeave = "on-leave"
}

enum Scope {
  self = 'self',
  student = 'student',
}

@ValidatorConstraint({ name: 'isNotAfterToday', async: false })
export class IsNotAfterToday implements ValidatorConstraintInterface {
  validate(date: Date, args: ValidationArguments) {
    const currentDateIST = addHours(new Date(), 5.5);
    return isBefore(date, currentDateIST);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Attendance date must not be after today';
  }
}
export class AttendanceDto {
  @Expose()
  attendanceId: string;

  @Expose()
  tenantId: string;

  @ApiProperty({
    type: String,
    description: "The userid of the attendance",
    default: "",
  })
  @IsDefined()
  @IsNotEmpty()
  @IsUUID()
  @Expose()
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({
    type: String,
    description: "The date of the attendance in format yyyy-mm-dd",
    default: new Date()
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Please provide a valid date in the format yyyy-mm-dd' })
  @Validate(IsNotAfterToday, {
    message: 'Attendance date must not be after today',
  })
  @Expose()
  attendanceDate: Date;

  @ApiProperty({
    type: String,
    description: "The attendance of the attendance",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsEnum(Attendance, { message: "Please enter valid enum values for attendance [present, absent,on-leave]" })
  attendance: string;


  @Expose()
  @ApiPropertyOptional()
  remark: string;


  @Expose()
  @ApiPropertyOptional()
  latitude: number;


  @Expose()
  @ApiPropertyOptional()
  longitude: number;


  @Expose()
  @ApiPropertyOptional()
  image: string;

  @ApiPropertyOptional()
  @Expose()
  metaData: string;

  @ApiPropertyOptional()
  @Expose()
  syncTime: string;

  @ApiPropertyOptional()
  @Expose()
  session: string;

  @ApiPropertyOptional({
    type: String,
    description: "The contextType of the attendance",
    default: "",
  })
  @Expose()
  contextType: string;

  @ApiProperty({
    type: String,
    description: "The contextId of the attendance",
    default: "",
  })
  @IsNotEmpty()
  @IsUUID()
  @Expose()
  @IsDefined()
  contextId: string;

  @ManyToOne(() => Cohort, { nullable: true }) // Define the ManyToOne relationship with Cohort entity
  @JoinColumn({ name: "contextId", referencedColumnName: "cohortId" }) // Map contextId to cohortId column in Cohort table
  cohort: Cohort;


  @CreateDateColumn()
  @Expose()
  createdAt: string;

  @UpdateDateColumn()
  @Expose()
  updatedAt: string;

  @Expose()
  createdBy: string;

  @Expose()
  updatedBy: string;

  @Expose()
  lateMark: boolean;

  @ApiPropertyOptional()
  @Expose()
  absentReason: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.scope !== undefined && o.scope !== null) @IsEnum(Scope, { message: "Please enter valid enum values for scope [self, student]" })
  scope: string

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}


export class UserAttendanceDTO {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({
    type: String,
    description: "The attendance of the attendance",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsEnum(Attendance, { message: "Please enter valid enum values for attendance [present, absent,on-leave, half-day]" })
  attendance: string;


  @Expose()
  @ApiPropertyOptional()
  remark: string;

  @Expose()
  @ApiPropertyOptional()
  latitude: number;

  @Expose()
  @ApiPropertyOptional()
  longitude: number;


  @Expose()
  @ApiPropertyOptional()
  image: string;

  @ApiPropertyOptional()
  @Expose()
  metaData: string;

  @ApiPropertyOptional()
  @Expose()
  syncTime: string;

  @ApiPropertyOptional()
  @Expose()
  session: string;

  @ApiPropertyOptional({
    type: String,
    description: "The contextType of the attendance",
    default: "",
  })
  @Expose()
  contextType: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.scope !== undefined && o.scope !== null)
  @IsEnum(Scope, { message: "Please enter valid enum values for scope [self, student]" })
  scope: string
}

export class BulkAttendanceDTO {
  @ApiProperty({
    type: String,
    description: "The date of the attendance in format yyyy-mm-dd",
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Please provide a valid date in the format yyyy-mm-dd' })
  @Validate(IsNotAfterToday, {
    message: 'Attendance date must not be after today',
  })
  @Expose()
  attendanceDate: Date;

  @IsUUID()
  @Expose()
  @IsNotEmpty()
  @ApiProperty()

  contextId: string;

  @ApiPropertyOptional()
  @ValidateIf(o => o.scope !== undefined && o.scope !== null)
  @IsEnum(Scope, { message: "Please enter valid enum values for scope [self, student]" })
  scope: string


  @ApiProperty({
    type: [UserAttendanceDTO], // Specify the type of userAttendance as an array of UserAttendanceDTO
    description: 'List of user attendance details',
  })
  @ValidateNested({ each: true })
  @Type(() => UserAttendanceDTO)
  // Adjust the max size according to your requirements
  userAttendance: UserAttendanceDTO[];

  @ApiPropertyOptional({
    type: Object,
    description: "Cohort attendance params",
    default: {},
  })
  @Expose()
  params: object;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
