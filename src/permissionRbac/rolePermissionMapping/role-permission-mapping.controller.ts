import { Body, Controller, Delete, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RolePermissionService } from "./role-permission-mapping.service";
import { RolePermissionCreateDto } from "./dto/role-permission-create-dto";
import { Response, Request } from "express";
@ApiTags("RolePermissionMapping")
@Controller("role-permission")
export class RolePermissionMappingController {
  constructor(private rolePermissionService: RolePermissionService) {}

  //Create a new permission
  @Post("/create")
  public async createPermission(
    @Req() request: Request,
    @Res() response: Response,
    @Body() permissionCreateDto: RolePermissionCreateDto
  ): Promise<Response> {
    return await this.rolePermissionService.createPermission(
      request,
      permissionCreateDto,
      response
    );
  }

  //get permission
  @Post("/get")
  public async getPermission(
    @Res() response: Response,
    @Body() roleTitle: string,
    @Body() apiPath: string
  ): Promise<Response> {
    return await this.rolePermissionService.getPermission(
      roleTitle,
      apiPath,
      response
    );
  }
  //update permission
  @Post("/update")
  public async updatePermission(
    @Req() request: Request,
    @Res() response: Response,
    @Body() permissionCreateDto: RolePermissionCreateDto
  ): Promise<Response> {
    return await this.rolePermissionService.updatePermission(
      request,
      permissionCreateDto,
      response
    );
  }
  //delete permission
  @Delete("/delete")
  public async deletePermission(
    @Req() request: Request,
    @Res() response: Response,
    @Body() rolePermissionId: string
  ): Promise<Response> {
    return await this.rolePermissionService.deletePermission(
      request,
      rolePermissionId,
      response
    );
  }
}
