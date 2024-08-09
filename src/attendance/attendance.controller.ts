import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiConsumes,
  ApiHeader,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  UseInterceptors,
  ClassSerializerInterceptor,
  SerializeOptions,
  Req,
  Request,
  UploadedFile,
  Headers,
  UsePipes,
  ValidationPipe,
  Res,
  UseGuards,
  HttpStatus,
} from "@nestjs/common";
import { AttendanceDto, BulkAttendanceDTO } from "./dto/attendance.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { editFileName, imageFileFilter } from "./utils/file-upload.utils";
import { AttendanceSearchDto } from "./dto/attendance-search.dto";
import { AttendaceAdapter } from "./attendanceadapter";
import { AttendanceDateDto } from "./dto/attendance-date.dto";
import { AttendanceStatsDto } from "./dto/attendance-stats.dto";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";

@ApiTags("Attendance")
@Controller("attendance")
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private attendaceAdapter: AttendaceAdapter,
  ) { }

  // @Get("/:id")
  // @UseInterceptors(ClassSerializerInterceptor)
  // @ApiBasicAuth("access-token")
  // @ApiCreatedResponse({ description: "Attendance detail" })
  // @ApiForbiddenResponse({ description: "Forbidden" })
  // @SerializeOptions({
  //   strategy: "excludeAll",
  // })
  // @ApiHeader({
  //   name: "tenantid",
  // })
  // public async getAttendance(
  //   @Headers() headers,
  //   @Param("id") attendanceId: string,
  //   @Req() request: Request
  // ) {
  //   let tenantid = headers["tenantid"];
  //   return await this.attendaceAdapter
  //     .buildAttenceAdapter()
  //     .getAttendance(tenantid, attendanceId, request);
  // }

  @Post()
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({
    description: "Attendance has been created successfully.",
  })
  @UseInterceptors(
    FileInterceptor("image", {
      storage: diskStorage({
        destination: process.env.IMAGEPATH,
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
    })
  )
  @ApiBody({ type: AttendanceDto })
  // @UseInterceptors(ClassSerializerInterceptor)
  @ApiHeader({
    name: "tenantid"
  })
  @UsePipes(ValidationPipe)
  public async createAttendace(
    @Headers() headers,
    @Req() request,
    @Body() attendanceDto: AttendanceDto,
    @Res() response: Response,
    @UploadedFile() image
  ) {
    attendanceDto.tenantId = headers["tenantid"];
    attendanceDto.image = image?.filename;
    const result = await this.attendaceAdapter.buildAttenceAdapter().updateAttendanceRecord(
      request.user.userId,
      attendanceDto
    );
    return response.status(result.statusCode).json(result);
  }




  @Post("/list")
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Attendance List" })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  @ApiBody({ type: AttendanceSearchDto })
  // @UseInterceptors(ClassSerializerInterceptor)
  @UsePipes(ValidationPipe)
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
  })
  public async searchAttendanceNew(
    @Headers() headers,
    @Req() request: Request,
    @Body() studentSearchDto: AttendanceSearchDto,
    @Res() response: Response
  ) {
    let tenantid = headers["tenantid"];
    if (!tenantid) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        errorMessage: "tenantId is missing in headers",
      });
    }

    const result = await this.attendaceAdapter.buildAttenceAdapter().searchAttendance(
      tenantid,
      request,
      studentSearchDto
    );
    return response.status(result.statusCode).json(result);
  }



  @Post("bulkAttendance")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Attendance has been created successfully." })
  @ApiBadRequestResponse({ description: "Bad Request", })
  @ApiOkResponse({ description: "Attendance updated successfully" })
  @ApiInternalServerErrorResponse({ description: "Internal server error" })
  @ApiBody({ type: BulkAttendanceDTO })
  @ApiHeader({
    name: "tenantid",
  })
  @UsePipes(ValidationPipe)
  public async multipleAttendance(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() attendanceDtos: BulkAttendanceDTO
  ) {
    let tenantId = headers["tenantid"];
    const result = await this.attendaceAdapter.buildAttenceAdapter().multipleAttendance(
      tenantId,
      request,
      attendanceDtos,
      response,
    );
    return response.status(result.statusCode).json(result);
  }

}
