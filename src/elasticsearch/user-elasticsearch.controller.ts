import { Controller, Post, Body, Get, Put, Param, Query } from '@nestjs/common';
import { UserElasticsearchService } from './user-elasticsearch.service';
import { IUser, IApplication, ICourse } from './interfaces/user.interface';
import { isElasticsearchEnabled } from 'src/common/utils/elasticsearch.util';

@Controller('elasticsearch/users')
export class UserElasticsearchController {
  constructor(
    private readonly userElasticsearchService: UserElasticsearchService
  ) {}

  @Post()
  async createUser(@Body() userData: IUser) {
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.createUser(userData);
    }
    return null;
  }

  @Put(':userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateData: Partial<IUser>
  ) {
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.updateUser(userId, updateData);
    }
    return null;
  }

  @Put(':userId/applications/:cohortId')
  async updateApplication(
    @Param('userId') userId: string,
    @Param('cohortId') cohortId: string,
    @Body() application: Partial<IApplication>
  ) {
    const fullApplication: IApplication = {
      cohortId,
      cohortmemberstatus: application.cohortmemberstatus || 'SUBMITTED',
      formstatus: application.formstatus || 'SUBMITTED',
      lastSavedAt: application.lastSavedAt || new Date().toISOString(),
      submittedAt: application.submittedAt || new Date().toISOString(),
      cohortDetails: {
        cohortId: application.cohortDetails?.cohortId || cohortId,
        name: application.cohortDetails?.name || '',
        type: application.cohortDetails?.type || 'COHORT',
        status: application.cohortDetails?.status || 'active',
      },
      progress: application.progress || {
        pages: {},
        overall: {
          total: 0,
          completed: 0,
        },
      },
    };
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.updateApplication(
        userId,
        fullApplication
      );
    }
    return null;
  }

  @Put(':userId/courses/:courseId')
  async updateCourse(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
    @Body() course: Partial<ICourse>
  ) {
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.updateCourse(
        userId,
        courseId,
        course
      );
    }
    return null;
  }

  @Put(':userId/applications/:cohortId/pages/:pageId')
  async updateApplicationPage(
    @Param('userId') userId: string,
    @Param('cohortId') cohortId: string,
    @Param('pageId') pageId: string,
    @Body() pageData: { completed: boolean; fields: Record<string, any> }
  ) {
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.updateApplicationPage(
        userId,
        cohortId,
        pageId,
        pageData
      );
    }
    return null;
  }

  @Post('search')
  async searchUsers(@Body() body: any) {
    if (isElasticsearchEnabled()) {
      return this.userElasticsearchService.searchUsers(body);
    }
    return null;
  }
}
