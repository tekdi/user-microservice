import {
  Controller,
  Res,
  Body,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { API_RESPONSES } from "@utils/response.messages";
import { RolePermissionService } from "./role-permission-mapping.service";

@ApiTags("RolePermissionMapping")
@Controller("role-permission")
export class RolePermissionMappingController {
  constructor(private rolePermissionService: RolePermissionService) {}

  //Create a new permission
  @Post("/create")
  @ApiCreatedResponse({ description: API_RESPONSES.TENANT_CREATE })
  @ApiForbiddenResponse({ description: API_RESPONSES.FORBIDDEN })
  public async createPermission(
    @Res() response: Response,
    @Body() permissionCreateDto: any,
    @Query("userId", new ParseUUIDPipe()) userId: string
  ): Promise<Response> {
    return await this.rolePermissionService.createRolePermission(
      permissionCreateDto,
      response
    );
  }
}
