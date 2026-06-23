import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { LocationService } from "./location.service";
import { CreateLocationDto } from "./dto/location-create.dto";
import { LocationHierarchySearchDto } from "./dto/location-hierarchy-search.dto";
import { LocationHierarchyResponseDto } from "./dto/location-hierarchy-response.dto";
import { Request, Response } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from "@nestjs/swagger";


@ApiTags("Location")
@Controller("location")
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @ApiOperation({ 
    summary: "Hierarchy Search", 
    description: "Search location hierarchy with support for parent/child traversal, target filtering, and keyword search" 
  })
  @ApiBody({ type: LocationHierarchySearchDto })
  @ApiResponse({ 
    status: 200, 
    description: "Hierarchy search completed successfully", 
    type: LocationHierarchyResponseDto 
  })
  @ApiResponse({ 
    status: 400, 
    description: "Bad Request - Invalid search parameters" 
  })
  @ApiResponse({ 
    status: 500, 
    description: "Internal Server Error" 
  })
  @Post("hierarchy-search")
  async hierarchySearch(
    @Body() searchDto: LocationHierarchySearchDto,
    @Res() response: Response
  ): Promise<Response> {
    try {
      const result = await this.locationService.hierarchySearch(searchDto);
      return response.status(HttpStatus.OK).json(result);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
          data: null,
          error: error.name
        });
      }
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Internal server error occurred",
        data: null,
        error: error.message
      });
    }
  }

  // Legacy endpoints removed - Location table doesn't exist
  // Use the new hierarchy-search endpoint instead
}
