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
@ValidatorConstraint({ name: 'atLeastOneFilter', async: false })
export class AtLeastOneFilterConstraint implements ValidatorConstraintInterface {
  validate(filters: any, args: ValidationArguments): boolean {
    if (!filters || typeof filters !== 'object') {
      return false;
    }
    
    // Check if any filter has values
    const hasLocationFilter = Object.keys(filters).some(key => {
      const value = filters[key];
      return Array.isArray(value) && value.length > 0;
    });
    
    // Check if roles are provided in the parent object
    const parentObject = args.object as any;
    const hasRoleFilter = parentObject.role && Array.isArray(parentObject.role) && parentObject.role.length > 0;
    
    return hasLocationFilter || hasRoleFilter;
  }

  defaultMessage(): string {
    return 'At least one location filter or role filter must be provided';
  }
}

/**
 * Custom validator for sort configuration
 */
@ValidatorConstraint({ name: 'validSortConfig', async: false })
export class ValidSortConfigConstraint implements ValidatorConstraintInterface {
  private allowedSortFields = ['name', 'firstName', 'lastName', 'username', 'email', 'createdAt'];
  private allowedSortDirections = ['asc', 'desc'];

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
    return `Sort must be [field, direction] where field is one of: ${['name', 'firstName', 'lastName', 'username', 'email', 'createdAt'].join(', ')} and direction is 'asc' or 'desc'`;
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

class LocationFiltersDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Array of State IDs to filter by",
    example: ["state-uuid-1", "state-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  state?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of District IDs to filter by",
    example: ["district-uuid-1", "district-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  district?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Block IDs to filter by",
    example: ["block-uuid-1", "block-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  block?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Village IDs to filter by",
    example: ["village-uuid-1", "village-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  village?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Center IDs to filter by",
    example: ["center-uuid-1", "center-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  center?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of Batch/Cohort IDs to filter by",
    example: ["batch-uuid-1", "batch-uuid-2"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  batch?: string[];
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
    required: true
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
    required: true
  })
  @Expose()
  @IsNumber()
  @Min(0)
  offset: number;

  @ApiProperty({
    type: LocationFiltersDto,
    description: "Location-based filters for hierarchical search. At least one location filter or role filter must be provided.",
    required: true
  })
  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationFiltersDto)
  @IsAtLeastOneFilter({
    message: 'At least one location filter or role filter must be provided'
  })
  filters: LocationFiltersDto;

  @ApiProperty({
    type: [String],
    description: "Sort configuration [field, direction]. Must be exactly 2 elements: [field, direction]. Allowed fields: name, firstName, lastName, username, email, createdAt. Directions: asc, desc",
    example: ["name", "asc"],
    isArray: true,
    required: true
  })
  @Expose()
  @IsArray()
  @ArrayMinSize(2, { message: 'Sort array must contain exactly 2 elements: [field, direction]' })
  @ArrayMaxSize(2, { message: 'Sort array must contain exactly 2 elements: [field, direction]' })
  @IsString({ each: true })
  @IsValidSortConfig({
    message: 'Invalid sort configuration. Field must be one of: name, firstName, lastName, username, email, createdAt. Direction must be asc or desc'
  })
  sort: [string, string];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of role names to filter users by",
    example: ["Instructor", "Lead", "Content creator", "Content reviewer", "Central Lead", "Super Admin", "State Lead", "Learner"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  role?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Array of custom field names to include in response",
    example: ["state", "district", "block", "village", "center", "main_subject", "subject"]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customfields?: string[];
}