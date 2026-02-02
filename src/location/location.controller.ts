import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
} from "@nestjs/common";
import { LocationService } from "./location.service";
import { CreateLocationDto } from "./dto/location-create.dto";
import { Response } from "express";

@Controller("locations")
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post()
  create(
    @Body() createLocationDto: CreateLocationDto,
    @Res() response: Response
  ): Promise<Response> {
    return this.locationService.create(createLocationDto, response);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @Res() response: Response
  ): Promise<Response> {
    return this.locationService.findLocation(id, response);
  }

  @Patch("/update/:id")
  update(
    @Param("id") id: string,
    @Body() updateLocationDto: any,
    @Res() response: Response
  ): Promise<Response> {
    return this.locationService.update(id, updateLocationDto, response);
  }

  @Delete("/delete/:id")
  remove(
    @Param("id") id: string,
    @Res() response: Response
  ): Promise<Response> {
    return this.locationService.remove(id, response);
  }

  @Post("search")
  search(@Body() filters: any, @Res() response: Response): Promise<Response> {
    return this.locationService.filter(filters, response);
  }
}
