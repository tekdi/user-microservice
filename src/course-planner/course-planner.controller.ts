import { Controller, Post, UploadedFile, UseInterceptors, Req, HttpException, HttpStatus, ConsoleLogger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CoursePlannerService } from './course-planner.service';
import { MetaDataDto } from './dto/meta-data.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { Request } from 'express';

@Controller('course-planner')
export class CoursePlannerController {
  constructor(private readonly coursePlannerService: CoursePlannerService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) 
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request
  ) {
      if (!file) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }
      // Extract metadata from the form data
      const metaData = req.body.metaData;
      if (!metaData) {
        throw new HttpException('No metadata provided', HttpStatus.BAD_REQUEST);
      }

      // Parse metadata string to an object
      const metaDataObject: MetaDataDto = JSON.parse(metaData);
      const createProjectDto = new CreateProjectDto();
      console.log(metaDataObject);
      const result = await this.coursePlannerService.processUploadedData(file, metaDataObject,createProjectDto);
      return result;
    } 
  }

