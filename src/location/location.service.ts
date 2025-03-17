import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Location } from "./entities/location.entity";
import { CreateLocationDto } from "./dto/location-create.dto";
import { error } from "console";
import APIResponse from "src/common/responses/response";
import { Response } from "express";

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>
  ) {}

  async create(
    createLocationDto: CreateLocationDto,
    response: Response
  ): Promise<Response> {
    const apiId = "api.create.location";
    try {
      const location = this.locationRepository.create(createLocationDto);
      const result = await this.locationRepository.save(location);
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Location created successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  //API to find location using Id
  async findLocation(id: string, response): Promise<Response> {
    const apiId = "api.find.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      return APIResponse.success(
        response,
        apiId,
        location,
        HttpStatus.OK,
        "Location found successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //API for update
  async update(
    id: string,
    updateLocationDto: any,
    response
  ): Promise<Response> {
    const apiId = "api.update.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      await this.locationRepository.update(id, updateLocationDto);
      return APIResponse.success(
        response,
        apiId,
        null,
        HttpStatus.OK,
        "Location updated successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //API for delete
  async remove(id: string, response: Response): Promise<Response> {
    const apiId = "api.delete.location";
    try {
      const location = await this.locationRepository.find({
        where: { id: id },
      });
      if (!location) {
        return APIResponse.error(
          response,
          apiId,
          "Location not found",
          null,
          HttpStatus.NOT_FOUND
        );
      }
      await this.locationRepository.delete(id);
      return APIResponse.success(
        response,
        apiId,
        null,
        HttpStatus.OK,
        "Location deleted successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async filter(reqObj: any, response): Promise<Response> {
    const apiId = "api.filter.location";
    try {
      const query = this.locationRepository.createQueryBuilder("location");
      if (Object.keys(reqObj.filters).length == 0) {
        query.limit(reqObj.limit).offset(reqObj.offset);
        const allLocations = await query.getMany();
        return APIResponse.success(
          response,
          apiId,
          allLocations,
          HttpStatus.OK,
          "All locations retrieved successfully"
        );
      }

      Object.keys(reqObj.filters).forEach((key) => {
        if (reqObj.filters[key]) {
          query.andWhere(`location.${key} = :${key}`, {
            [key]: reqObj.filters[key],
          });
        }
      });
      query.limit(reqObj.limit).offset(reqObj.offset);
      const result = await query.getMany();
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        "Location filtered successfully"
      );
    } catch (e) {
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
        e,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
