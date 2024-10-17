import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { stringify } from 'csv';
import { CreateProjectDto } from './dto/create-project.dto';
import { HttpService } from '../common/utils/http-service';
import { MetaDataDto } from './dto/meta-data.dto';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { URL } from './url-config';


@Injectable()
export class CoursePlannerService {
  private baseUrl: string;
  private authToken: string;
  private internalAccessToken: string;
  private readonly logger = new Logger(CoursePlannerService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>('SHIKSHA_LOKAM_URL');
    this.internalAccessToken = this.configService.get<string>('INTERNAL_ACCESS_TOKEN');

    if (!this.baseUrl || !this.internalAccessToken) {
      throw new Error('Missing required configuration');
    }
  }

  async processUploadedData(file: Express.Multer.File, metaData: MetaDataDto, createProjectDto: CreateProjectDto,authToken: string){
    try {
      this.authToken=authToken;
      const projectExternalId = this.generateProjectExternalId(metaData);
      const checkAndCreateProject = await this.validateAndCreateProject(projectExternalId, metaData, createProjectDto);
      await this.createProjectSubtask(checkAndCreateProject, file);
      const programData = await this.createProgram(metaData);
      const createSolution = await this.createSolution(programData?.result?.externalId, metaData);
      const result = await this.mappingSolution(projectExternalId, createSolution?.result?._id);

      return {
        message: "Course Planner Uploaded Successfully",
        result: {
          result,
          projectId: checkAndCreateProject,
          programId: programData,
          solutionData: createSolution
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error in processUploadedData: ${error.message}`, error.stack);
      throw new HttpException('Failed to process uploaded data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private generateProjectExternalId(metaData: MetaDataDto): string {
    const subjectAbbreviation = this.hashSubject(metaData.subject.toLowerCase());
    return `${subjectAbbreviation}${metaData.state.slice(
      0,
      2
    )}${metaData.board.slice(0, 2)}${metaData.type.slice(
      0,
      2
    )}${metaData.medium.slice(0, 2)}${metaData.class}`;
  }

  private hashSubject(subject: string): string {
    let hash = 0;
    for (let i = 0; i < subject.length; i++) {
      hash = subject.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `S${hash & 0xffff}`; 
  }
  private async createSolution(externalId: string, metadata: MetaDataDto): Promise<any> {
    try {
      const solutionData = this.prepareSolutionData(externalId, metadata);
      const url = `${this.baseUrl}/project/v1/solutions/create`;
      const response = await this.makeHttpRequest('post', url, solutionData);
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating solution: ${error.message}`, error.stack);
      throw new HttpException('Failed to create solution', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private prepareSolutionData(externalId: string, metadata: MetaDataDto): any {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setFullYear(startDate.getFullYear() + 1);

    return {
      name: `Solution Mapping for ${metadata.subject} Course`,
      programExternalId: externalId,
      resourceType: [],
      language: [],
      keywords: [],
      concepts: [],
      themes: [],
      flattenedThemes: [],
      registry: [],
      isRubricDriven: false,
      enableQuestionReadOut: false,
      allowMultipleAssessments: false,
      isDeleted: false,
      entityType: "school",
      type: "improvementProject",
      subType: "improvementProject",
      isReusable: false,
      externalId: `sol-${Math.random().toString().slice(2, 10)}`,
      minNoOfSubmissionsRequired: 2,
      scope: {
        class: [metadata.class],
        state: [metadata.state],
        board: [metadata.board],
        roles: ["Learner", "Teacher"],
        subject: [metadata.subject],
        medium: [metadata.medium]
      },
      isATargetedSolution: true,
      isAPrivateProgram: false,
      "startDate" : "2024-09-16 18:50:00",
      "endDate": "2025-10-19 18:50:00"
    };
  }

  private async mappingSolution(externalId: string, solutionId: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/project/v1/project/templates/importProjectTemplate/${externalId}?solutionId=${solutionId}`;
      const projectData = { rating: 5 };
      const response = await this.makeHttpRequest('post', url, projectData);
      return response.data;
    } catch (error) {
      this.logger.error(`Error mapping solution: ${error.message}`, error.stack);
      throw new HttpException('Failed to map solution', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async createProgram(metadata: MetaDataDto): Promise<any> {
    try {
      const programData = this.prepareProgramData(metadata);
      const url = `${this.baseUrl}/project/v1/programs/create`;
      const response = await this.makeHttpRequest('post', url, programData);
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating program: ${error.message}`, error.stack);
      throw new HttpException('Failed to create program', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private prepareProgramData(metadata: MetaDataDto): any {
    // const startDate = new Date();
    // const endDate = new Date(startDate);
    // endDate.setFullYear(startDate.getFullYear() + 1);

    return {
      externalId: `SCP${metadata?.subject}2024`,
      name: `Scp Program`,
      description: `${metadata.subject} program for class ${metadata.class}`,
      isDeleted: false,
      resourceType: ["program"],
      components: [],
      requestForPIIConsent: true,
      scope: {
        class: [metadata.class],
        state: [metadata.state],
        board: [metadata.board],
        subject: [metadata.subject],
        medium: [metadata.medium],
        roles: ["Learner", "Teacher"]
      },
      "startDate" : "2024-09-16 18:50:00",
      "endDate": "2025-10-19 18:50:00"
    };
  }

  // private async createProjectSubtask1(projectId: string, file: Express.Multer.File): Promise<any> {
  //   try {
  //     const form = new FormData();
  //     form.append('projectTemplateTasks', file.buffer, {
  //       filename: file.originalname,
  //       contentType: file.mimetype,
  //     });

  //     const url = `${this.baseUrl}/project/v1/project/templateTasks/bulkCreate/${projectId}`;
  //     const response = await this.makeHttpRequest('post', url, form, {
  //       ...form.getHeaders(),
  //       'internal-access-token': `${this.internalAccessToken}`,
  //     });
  //     this.logger.error(`Project subtask Created Successfully: `, response.data);
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error(`Error creating project subtask: ${error.message}`, error.stack);
  //     throw new HttpException('Failed to create project subtask', HttpStatus.INTERNAL_SERVER_ERROR);
  //   }
  // }
  private async createProjectSubtask(projectId: string, file: Express.Multer.File): Promise<any> {
    try {
      const form = new FormData();
      form.append('projectTemplateTasks', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
  
      const url = `${this.baseUrl}/project/v1/project/templateTasks/bulkCreate/${projectId}`;
      const response = await this.makeHttpRequest('post', url, form, {
        ...form.getHeaders(),
        'internal-access-token': `${this.internalAccessToken}`,
      });
         const responseData = response.data;
         // Check if the string contains the specific status message
        if (responseData.includes('Project template tasks already exists') || responseData.includes('"Project template tasks already exists"')) {
            throw new HttpException('Project Template Already Exists. Make Sure you add unique exteranl Id', HttpStatus.BAD_REQUEST);
        }

  
      this.logger.log(`Project subtask Created Successfully: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating project subtask: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error; // Re-throw HttpExceptions (including our custom one)
      }
      throw new HttpException('Failed to create project subtask', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  private async validateAndCreateProject(externalId: string, metaData: MetaDataDto, createProjectDto: CreateProjectDto) {
    try {
      const url = `${this.baseUrl}${URL.ValidateProjectUrl}`;
      const projectData = { externalIds: [externalId] };
      const response = await this.makeHttpRequest('post', url, projectData, {
        'internal-access-token':  `${this.internalAccessToken}`,
      });

      if (response.status === 400) {
        return this.createProject(externalId, metaData, createProjectDto);
      } else {
        return response.data.result[0]._id;
      }
    } catch (error) {
      this.logger.error(`Error validating project: ${error.message}`, error.stack);
      throw new HttpException('Failed to validate project', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async createProject(externalId: string, metaData: MetaDataDto, createProjectDto: CreateProjectDto) {
    try {
      const csvBuffer = await this.createCsvFromDto(externalId, metaData, createProjectDto);
      return this.uploadProjectTemplate(csvBuffer);
    } catch (error) {
      this.logger.error(`Error creating project: ${error.message}`, error.stack);
      throw new HttpException('Failed to create project', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async uploadProjectTemplate(csvBuffer: Buffer): Promise<any> {
    try {
      const form = new FormData();
      form.append('projectTemplates', csvBuffer, {
        filename: 'project_template.csv',
        contentType: 'text/csv',
      });

      const url = `${this.baseUrl}${URL.CreateProjectUrl}`;
      const response = await this.makeHttpRequest('post', url, form, {
        ...form.getHeaders(),
        'internal-access-token':  `${this.internalAccessToken}`,
      });

      const responseData = response.data;
      const fields = responseData.split(',');
      return fields[fields.length - 1].replace(/"/g, '');
    } catch (error) {
      this.logger.error(`Error uploading project template: ${error.message}`, error.stack);
      throw new HttpException('Failed to upload project template', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async createCsvFromDto(externalId: string, metaData: MetaDataDto, createProjectDto: CreateProjectDto): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const csvData = this.prepareCsvData(externalId, metaData, createProjectDto);
      const headers = csvData.map(item => item.column1);
      const values = csvData.map(item => item.column2);

      stringify([headers, values], (err, output) => {
        if (err) {
          this.logger.error(`Error creating CSV: ${err.message}`, err.stack);
          return reject(new HttpException('Failed to create CSV', HttpStatus.INTERNAL_SERVER_ERROR));
        }
        resolve(Buffer.from(output));
      });
    });
  }

  private prepareCsvData(externalId: string, metaData: MetaDataDto, createProjectDto: CreateProjectDto): Array<{column1: string, column2: string}> {
    return [
      { column1: 'title', column2: metaData.subject },
      { column1: 'externalId', column2: externalId },
      { column1: 'categories', column2: "educationLeader" },
      { column1: 'recommendedFor', column2: "Head Master/Mistress (HM),Principal,Head Teacher,Elementary School Head Master (ESHM)" },
      { column1: 'description', column2: "Course planner " },
      { column1: 'entityType', column2: "" },
      { column1: 'goal', column2: "TEMP" },
      { column1: 'rationale', column2: "" },
      { column1: 'primaryAudience', column2: "" },
      { column1: 'taskCreationForm', column2: "" },
      { column1: 'duration', column2: createProjectDto.duration },
      { column1: 'concepts', column2: "" },
      { column1: 'keywords', column2: "" },
      { column1: 'successIndicators', column2: "" },
      { column1: 'risks', column2: "" },
      { column1: 'approaches', column2: "" },
      { column1: '_arrayFields', column2: "categories,recommendedFor,primaryAudience,successIndicators,risks,approaches" },
    ];
  }

  private async makeHttpRequest(method: 'get' | 'post', url: string, data?: any, additionalHeaders: any = {}): Promise<any> {
    const config = {
      headers: {
        'X-auth-token': this.authToken,
        'Content-Type': 'application/json',
        ...additionalHeaders
      },
    };

    try {
      const response = await this.httpService[method](url, data, config);
      return response;
    } catch (error) {
      this.logger.error(`HTTP request failed: ${error.message}`, error.stack);
      throw new HttpException('Failed to make HTTP request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}