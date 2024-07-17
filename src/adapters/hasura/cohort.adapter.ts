import { Injectable } from "@nestjs/common";
import { CohortInterface } from "../../cohort/interfaces/cohort.interface";
import { HttpService } from "@nestjs/axios";
import { SuccessResponse } from "src/success-response";
import { ErrorResponse } from "src/error-response";
const resolvePath = require("object-resolve-path");
import jwt_decode from "jwt-decode";
import { CohortDto } from "src/cohort/dto/cohort.dto";
import { CohortSearchDto } from "src/cohort/dto/cohort-search.dto";
import { IServicelocatorcohort } from "../cohortservicelocator";
import { UserDto } from "src/user/dto/user.dto";
import { FieldsService } from "./services/fields.service";
import { CohortCreateDto } from "src/cohort/dto/cohort-create.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { CohortUpdateDto } from "src/cohort/dto/cohort-update.dto";
export const HasuraCohortToken = "HasuraCohort";
@Injectable()
export class HasuraCohortService implements IServicelocatorcohort {
  private cohort: CohortInterface;

  constructor(
    private httpService: HttpService,
    private fieldsService: FieldsService
  ) { }
  getCohortHierarchyData(requiredData: any, response: any) {
    throw new Error("Method not implemented.");
  }
  public async getCohortList(tenantid: any, id: any, request: any, response: any) {
  }

  public async createCohort(request: any, cohortCreateDto: CohortCreateDto) {
    try {
      var axios = require("axios");

      let query = "";
      Object.keys(cohortCreateDto).forEach((e) => {
        if (
          cohortCreateDto[e] &&
          cohortCreateDto[e] != "" &&
          e != "fieldValues"
        ) {
          if (Array.isArray(cohortCreateDto[e])) {
            query += `${e}: "${JSON.stringify(cohortCreateDto[e])}", `;
          } else {
            query += `${e}: "${cohortCreateDto[e]}", `;
          }
        }
      });

      var data = {
        query: `mutation CreateCohort {
          insert_Cohort_one(object: {${query}}) {
          cohortId
          }
        }
        `,
        variables: {},
      };

      var config = {
        method: "post",
        url: process.env.REGISTRYHASURA,
        headers: {
          Authorization: request.headers.authorization,
          "x-hasura-admin-secret": process.env.REGISTRYHASURAADMINSECRET,
          "Content-Type": "application/json",
        },
        data: data,
      };

      const response = await axios(config);
      if (response?.data?.errors) {
        return new ErrorResponse({
          errorCode: response?.data?.errors[0]?.extensions?.code,
          errorMessage: response?.data?.errors[0]?.message,
        });
      } else {
        const result = response.data.data.insert_Cohort_one;
        let fieldCreate = true;
        let fieldError = null;
        //create fields values
        let cohortId = result?.cohortId;
        let field_value_array = cohortCreateDto.customFields

        // if (field_value_array.length > 0) {
        //   let field_values = [];
        //   for (let i = 0; i < field_value_array.length; i++) {
        //     let fieldValues = field_value_array[i].split(":");
        //     field_values.push({
        //       value: fieldValues[1] ? fieldValues[1] : "",
        //       itemId: cohortId,
        //       fieldId: fieldValues[0] ? fieldValues[0] : "",
        //       createdBy: cohortCreateDto?.createdBy,
        //       updatedBy: cohortCreateDto?.updatedBy,
        //     });
        //   }

        //   const response_field_values =
        //     await this.fieldsService.createFieldValuesBulk(field_values);
        //   if (response_field_values?.data?.errors) {
        //     fieldCreate = false;
        //     fieldError = response_field_values?.data;
        //   }
        // }

        if (fieldCreate) {
          return new SuccessResponse({
            statusCode: 200,
            message: "Ok.",
            data: result,
          });
        } else {
          return new ErrorResponse({
            errorCode: fieldError?.errors[0]?.extensions?.code,
            errorMessage: fieldError?.errors[0]?.message,
          });
        }
      }
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "401",
        errorMessage: e,
      });
    }
  }

  public async getCohort(
    tenantId: string,
    cohortId: any,
    request: any,
    res: any
  ) {
    var axios = require("axios");

    var data = {
      query: `query GetCohort($cohortId:uuid!, $tenantId:uuid!, $context:String!, $contextId:uuid!) {
        Cohort(
          where:{
            tenantId:{
              _eq:$tenantId
            }
            cohortId:{
              _eq:$cohortId
            },
          }
        ){
          tenantId
          programId
          cohortId
          parentId
          referenceId
          name
          type
          status
          image
          attendanceCaptureImage
          metadata
          createdAt
          updatedAt
          createdBy
          updatedBy
          fields: CohortFieldsTenants(
              where:{
                _or:[
                  {
                    tenantId:{
                      _eq:$tenantId
                    }
                    context:{
                      _eq:$context
                    }
                    contextId:{
                      _is_null:true
                    }
                  },
                  {
                    tenantId:{
                      _eq:$tenantId
                    }
                    context:{
                      _eq:$context
                    }
                    contextId:{
                      _eq:$contextId
                    }
                  }
                ]
              }
            ){
              tenantId
              fieldId
              assetId
              context
              contextId
              render
              groupId
              name
              label
              defaultValue
              type
              note
              description
              state
              required
              ordering
              metadata
              access
              onlyUseInSubform
              createdAt
              updatedAt
              createdBy
              updatedBy
              fieldValues: FieldValues(
                where:{
                  itemId:{
                    _eq:$contextId
                  },
                }
              ){
                  value
                  fieldValuesId
                  itemId
                  fieldId
                  createdAt
                  updatedAt
                  createdBy
                  updatedBy
            }
          }
        }
    }`,
      variables: {
        cohortId: cohortId,
        tenantId: tenantId,
        context: "Cohort",
        contextId: cohortId,
      },
    };

    var config = {
      method: "post",
      url: process.env.REGISTRYHASURA,
      headers: {
        "x-hasura-admin-secret": process.env.REGISTRYHASURAADMINSECRET,
        "Content-Type": "application/json",
      },
      data: data,
    };

    const response = await axios(config);
    if (response?.data?.errors) {
      return res.status(200).send({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      let result = response?.data?.data?.Cohort;
      return res.status(200).send({
        statusCode: 200,
        message: "Ok.",
        data: result,
      });
    }
  }

  public async searchCohort(tenantId: string, request: any, cohortSearchDto: CohortSearchDto) { }
  public async updateCohortStatus(cohortId: string, request: any) { }
  public async getCohortsDetails(cohortId: string) { }
  public async updateCohort(cohortId: string, request: any, cohortUpdateDto: CohortUpdateDto) { }

  public async mappedResponse(result: any) {
    const cohortResponse = result.map((item: any) => {
      const cohortMapping = {
        tenantId: item?.tenantId ? `${item.tenantId}` : "",
        programId: item?.programId ? `${item.programId}` : "",
        cohortId: item?.cohortId ? `${item.cohortId}` : "",
        parentId: item?.parentId ? `${item.parentId}` : "",
        name: item?.name ? `${item.name}` : "",
        type: item?.type ? `${item.type}` : "",
        status: item?.status ? `${item.status}` : "",
        image: item?.image ? `${item.image}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
        referenceId: item?.referenceId ? `${item.referenceId}` : "",
        metadata: item?.metadata ? `${item.metadata}` : "",
      };
      return new CohortDto(cohortMapping);
    });

    return cohortResponse;
  }

  public async searchCohortFields(request: any, tenantId: string, cohorts: any) {
    let cohort_fields = [];
    for (let i = 0; i < cohorts.length; i++) {
      let new_obj = new Object(cohorts[i]);
      let cohortId = new_obj["cohortId"];
      //get fields
      let response = await this.fieldsService.getFieldsContext(
        request,
        tenantId,
        "Cohort",
        cohortId
      );
      if (response?.data?.errors) {
      } else {
        let result = response?.data?.data?.Fields;
        new_obj["fields"] = result;
      }
      cohort_fields.push(new_obj);
    }
    return cohort_fields;
  }
  public async searchCohortQuery(
    request: any,
    tenantId: string,
    cohortSearchDto: CohortSearchDto
  ) { }
}
