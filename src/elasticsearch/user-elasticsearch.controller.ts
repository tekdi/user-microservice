import { Controller, Post, Body, Get, Put, Param, Query } from '@nestjs/common';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { IUser, IApplication, ICourse } from './interfaces/user.interface';

@Controller('elasticsearch/users')
export class UserElasticsearchController {
  constructor(private readonly userElasticsearchService: UserElasticsearchService) {}

  @Post()
  async createUser(@Body() userData: IUser) {
    return this.userElasticsearchService.createUser(userData);
  }

  @Put(':userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateData: Partial<IUser>
  ) {
    return this.userElasticsearchService.updateUser(userId, updateData);
  }

  @Put(':userId/applications/:cohortId')
  async updateApplication(
    @Param('userId') userId: string,
    @Param('cohortId') cohortId: string,
    @Body() application: Partial<IApplication>
  ) {
    const fullApplication: IApplication = {
      cohortId,
      status: application.status || 'SUBMITTED',
      cohortmemberstatus: application.cohortmemberstatus || 'SUBMITTED',
      formstatus: application.formstatus || 'SUBMITTED',
      lastSavedAt: application.lastSavedAt || new Date().toISOString(),
      submittedAt: application.submittedAt || new Date().toISOString(),
      cohortDetails: {
        name: application.cohortDetails?.name || '',
        description: application.cohortDetails?.description || '',
        startDate: application.cohortDetails?.startDate || '',
        endDate: application.cohortDetails?.endDate || '',
        status: application.cohortDetails?.status || ''
      },
      progress: application.progress || {
        pages: {},
        overall: {
          total: 0,
          completed: 0
        }
      }
    };
    return this.userElasticsearchService.updateApplication(userId, fullApplication);
  }

  @Put(':userId/courses/:courseId')
  async updateCourse(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
    @Body() course: Partial<ICourse>
  ) {
    return this.userElasticsearchService.updateCourse(userId, courseId, course);
  }

  @Put(':userId/applications/:cohortId/pages/:pageId')
  async updateApplicationPage(
    @Param('userId') userId: string,
    @Param('cohortId') cohortId: string,
    @Param('pageId') pageId: string,
    @Body() pageData: { completed: boolean; fields: Record<string, any> }
  ) {
    return this.userElasticsearchService.updateApplicationPage(userId, cohortId, pageId, pageData);
  }

  @Get('search')
  async searchUsers(@Query() query: any) {
    return this.userElasticsearchService.searchUsers(query);
  }
} 