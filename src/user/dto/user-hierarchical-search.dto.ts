import { Expose, Type } from "class-transformer";
import {
  IsOptional,
  IsArray,
  IsUUID,
  IsString,
  IsNumber,
  IsEnum,
  ValidateNested,
  IsObject,
  Min,
  Max,
  IsNotEmpty,
  IsIn,
  ArrayMinSize,
  ArrayMaxSize,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Custom validator to ensure at least one filter is provided
 */
@ValidatorConstraint({ name: "atLeastOneFilter", async: false })
export class AtLeastOneFilterConstraint
  implements ValidatorConstraintInterface
{
  validate(filters: any, args: ValidationArguments): boolean {
    // Allow empty filters now since we support name search and default users
    return true;
  }

  defaultMessage(): string {
    return "Filters are optional. You can search by location, role, or name, or leave empty for default results.";
  }
}

/**
 * Custom validator for sort configuration
 */
@ValidatorConstraint({ name: "validSortConfig", async: false })
export class ValidSortConfigConstraint implements ValidatorConstraintInterface {
  private allowedSortFields = [
    "name",
    "firstName",
    "lastName",
    "username",
    "email",
    "createdAt",
  ];
  private allowedSortDirections = ["asc", "desc"];

  validate(sortArray: any): boolean {
    if (!Array.isArray(sortArray) || sortArray.length !== 2) {
      return false;
    }

    const [field, direction] = sortArray;

    // Validate field
    if (!this.allowedSortFields.includes(field)) {
      return false;
    }

    // Validate direction
    if (!this.allowedSortDirections.includes(direction?.toLowerCase())) {
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return `Sort must be [field, direction] where field is one of: ${[
      "name",
      "firstName",
      "lastName",
      "username",
      "email",
      "createdAt",
    ].join(", ")} and direction is 'asc' or 'desc'`;
  }
}

/**
 * Decorator for validating at least one filter
 */
export function IsAtLeastOneFilter(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: AtLeastOneFilterConstraint,
    });
  };
}

/**
 * Decorator for validating sort configuration
 */
export function IsValidSortConfig(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidSortConfigConstraint,
    });
  };
}

/**
 * Custom validator for role names
 */
@ValidatorConstraint({ name: "validRoleNames", async: false })
export class ValidRoleNamesConstraint implements ValidatorConstraintInterface {
  validate(roleArray: string[]): boolean {
    if (!Array.isArray(roleArray)) {
      return false;
    }

    // Check if all roles are non-empty strings
    return roleArray.every(
      (role) => role && typeof role === "string" && role.trim().length > 0
    );
  }

  defaultMessage(): string {
    return "All role names must be non-empty strings";
  }
}

/**
 * Decorator for validating role names
 */
export function IsValidRoleNames(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidRoleNamesConstraint,
    });
  };
}

/**
 * Custom validator for location filter arrays (state, district, block, village, center)
 */
@ValidatorConstraint({ name: "validLocationFilter", async: false })
export class ValidLocationFilterConstraint
  implements ValidatorConstraintInterface
{
  validate(filterArray: string[]): boolean {
    if (!Array.isArray(filterArray)) {
      return false;
    }

    // Check if all filter values are non-empty strings
    return filterArray.every(
      (value) => value && typeof value === "string" && value.trim().length > 0
    );
  }

  defaultMessage(): string {
    return "All location filter values must be non-empty strings";
  }
}

/**
 * Decorator for validating location filter arrays
 */
export function IsValidLocationFilter(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ValidLocationFilterConstraint,
    });
  };
}

class LocationFiltersDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Array of State IDs to filter by",
    example: ["state-uuid-1", "state-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, {
    message: "State filter cannot contain more than 100 entries",
  })
  @IsString({ each: true })
  @IsValidLocationFilter()
  state?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of District IDs to filter by",
    example: ["district-uuid-1", "district-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500, {
    message: "District filter cannot contain more than 500 entries",
  })
  @IsString({ each: true })
  @IsValidLocationFilter()
  district?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Block IDs to filter by",
    example: ["block-uuid-1", "block-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000, {
    message: "Block filter cannot contain more than 2000 entries",
  })
  @IsString({ each: true })
  @IsValidLocationFilter()
  block?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Village IDs to filter by",
    example: ["village-uuid-1", "village-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000, {
    message: "Village filter cannot contain more than 5000 entries",
  })
  @IsString({ each: true })
  @IsValidLocationFilter()
  village?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Center IDs to filter by",
    example: ["center-uuid-1", "center-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000, {
    message: "Center filter cannot contain more than 1000 entries",
  })
  @IsString({ each: true })
  @IsValidLocationFilter()
  center?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Batch/Cohort IDs to filter by",
    example: ["batch-uuid-1", "batch-uuid-2"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000, {
    message: "Batch filter cannot contain more than 1000 entries",
  })
  @IsUUID(undefined, { each: true })
  batch?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Array of user status values to filter by. Allowed values: active, inactive, archived",
    example: ["active", "inactive"],
    enum: ["active", "inactive", "archived"],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, {
    message: "Status filter cannot contain more than 3 entries",
  })
  @IsString({ each: true })
  @IsIn(["active", "inactive", "archived"], {
    each: true,
    message: "Status must be one of: active, inactive, archived",
  })
  status?: string[];

  @ApiPropertyOptional({
    type: String,
    description:
      "Search keyword to filter users by name (case-insensitive, partial match). Searches in the 'name' field.",
    example: "demo",
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Name search keyword cannot be empty" })
  name?: string;
}

enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

enum AllowedSortFields {
  NAME = "name",
  FIRST_NAME = "firstName",
  LAST_NAME = "lastName",
  USERNAME = "username",
  EMAIL = "email",
  CREATED_AT = "createdAt",
}

export class HierarchicalLocationFiltersDto {
  @ApiProperty({
    type: Number,
    description: "Number of records to return (pagination)",
    example: 10,
    minimum: 1,
    maximum: 100,
    required: true,
  })
  @Expose()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Number of records to skip (pagination)",
    example: 0,
    minimum: 0,
    required: true,
  })
  @Expose()
  @IsNumber()
  @Min(0)
  offset: number;

  @ApiProperty({
    type: LocationFiltersDto,
    description:
      "Location-based filters for hierarchical search. Filters are optional - you can search by location, role, name, or leave empty for default results.",
    required: true,
  })
  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationFiltersDto)
  @IsAtLeastOneFilter({
    message: "At least one location filter or role filter must be provided",
  })
  filters: LocationFiltersDto;

  @ApiProperty({
    type: [String],
    description:
      "Sort configuration [field, direction]. Must be exactly 2 elements: [field, direction]. Allowed fields: name, firstName, lastName, username, email, createdAt. Directions: asc, desc",
    example: ["name", "asc"],
    isArray: true,
    required: true,
  })
  @Expose()
  @IsArray()
  @ArrayMinSize(2, {
    message: "Sort array must contain exactly 2 elements: [field, direction]",
  })
  @ArrayMaxSize(2, {
    message: "Sort array must contain exactly 2 elements: [field, direction]",
  })
  @IsString({ each: true })
  @IsValidSortConfig({
    message:
      "Invalid sort configuration. Field must be one of: name, firstName, lastName, username, email, createdAt. Direction must be asc or desc",
  })
  sort: [string, string];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Array of role names to filter users by. All role names must be non-empty strings. Maximum 50 roles allowed.",
    example: [
      "Instructor",
      "Lead",
      "Content creator",
      "Content reviewer",
      "Central Lead",
      "Super Admin",
      "State Lead",
      "Learner",
    ],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, {
    message:
      "Role array cannot contain more than 50 roles to prevent performance issues",
  })
  @IsString({ each: true })
  @IsValidRoleNames({
    message: "All role names must be non-empty strings",
  })
  role?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Array of custom field names to include in response. Only location-based fields are supported.",
    example: [
      "state",
      "district",
      "block",
      "village",
      "main_subject",
      "subject",
    ],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidLocationFilter()
  customfields?: string[];
}
