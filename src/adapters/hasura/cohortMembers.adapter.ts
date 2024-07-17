import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { SuccessResponse } from "src/success-response";
import { ErrorResponse } from "src/error-response";
const resolvePath = require("object-resolve-path");
import { CohortMembersDto } from "src/cohortMembers/dto/cohortMembers.dto";
import { CohortMembersSearchDto } from "src/cohortMembers/dto/cohortMembers-search.dto";
import { IServicelocatorcohortMembers } from "../cohortMembersservicelocator";
import { CohortMembersUpdateDto } from "src/cohortMembers/dto/cohortMember-update.dto";

@Injectable()
export class HasuraCohortMembersService
  implements IServicelocatorcohortMembers
{
  constructor(private httpService: HttpService) {}
  createBulkCohortMembers(loginUser: any, cohortMembersDto: any, response: any, tenantId: any) {
    throw new Error("Method not implemented.");
  }

  public async createCohortMembers(
    request: any,
    cohortMembers: CohortMembersDto
  ) {
    try {
      var axios = require("axios");
      let query = "";
      Object.keys(cohortMembers).forEach((e) => {
        if (cohortMembers[e] && cohortMembers[e] != "") {
          if (Array.isArray(cohortMembers[e])) {
            query += `${e}: "${JSON.stringify(cohortMembers[e])}", `;
          } else {
            query += `${e}: "${cohortMembers[e]}", `;
          }
        }
      });

      var data = {
        query: `mutation CreateCohortMembers {
          insert_CohortMembers_one(object: {${query}}) {
          cohortMembershipId
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
        const result = response.data.data.insert_CohortMembers_one;
        return new SuccessResponse({
          statusCode: 200,
          message: "Ok.",
          data: result,
        });
      }
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  public async searchCohortMembers(cohortMembersSearchDto, tenantId, res) {}
  public async getCohortMembers(cohortMemberId, tenantId, fieldvalue, res) {}
  public async updateCohortMembers(
    cohortMembershipId: string,
    request: any,
    cohortMembersUpdateDto: CohortMembersUpdateDto,
    response: any
  ) {
  }

  public async mappedResponse(result: any) {
    const cohortMembersResponse = result.map((obj: any) => {
      const cohortMembersMapping = {
        tenantId: obj?.tenantId ? `${obj.tenantId}` : "",
        cohortMembershipId: obj?.cohortMembershipId
          ? `${obj.cohortMembershipId}`
          : "",
        cohortId: obj?.cohortId ? `${obj.cohortId}` : "",
        userId: obj?.userId ? `${obj.userId}` : "",
        role: obj?.role ? `${obj.role}` : "",
        createdAt: obj?.createdAt ? `${obj.createdAt}` : "",
        updatedAt: obj?.updatedAt ? `${obj.updatedAt}` : "",
        createdBy: obj?.createdBy ? `${obj.createdBy}` : "",
        updatedBy: obj?.updatedBy ? `${obj.updatedBy}` : "",
      };
      return new CohortMembersDto(cohortMembersMapping);
    });

    return cohortMembersResponse;
  }

  public async deleteCohortMemberById() {}
}
