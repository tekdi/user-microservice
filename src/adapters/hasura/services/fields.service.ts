import { Injectable } from "@nestjs/common";
import { FieldsDto } from "src/fields/dto/fields.dto";
import { FieldsSearchDto } from "src/fields/dto/fields-search.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { FieldValuesSearchDto } from "src/fields/dto/field-values-search.dto";
import jwt_decode from "jwt-decode";
import { ErrorResponse } from "src/error-response";

@Injectable()
export class FieldsService {
  constructor() { }

  //fields
  async createFields(request: any, fieldsDto: FieldsDto) {
    try {
      var axios = require("axios");

      // //add render json object
      // fieldsDto = await this.addRender(fieldsDto);

      let query = "";
      Object.keys(fieldsDto).forEach((e) => {
        if (fieldsDto[e] && fieldsDto[e] != "") {
          if (e === "render") {
            query += `${e}: ${fieldsDto[e]}, `;
          } else if (Array.isArray(fieldsDto[e])) {
            query += `${e}: "${JSON.stringify(fieldsDto[e])}", `;
          } else {
            query += `${e}: "${fieldsDto[e]}", `;
          }
        }
      });

      var data = {
        query: `mutation CreateFields {
          insert_Fields_one(object: {${query}}) {
            fieldId
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  public async getFields(tenantId: string, fieldsId: any) {
    var axios = require("axios");

    var data = {
      query: `query GetFields($fieldsId:uuid!, $tenantId:uuid!) {
        Fields(
          where:{
            tenantId:{
              _eq:$tenantId
            }
            fieldId:{
              _eq:$fieldsId
            },
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
      }
    }`,
      variables: {
        fieldsId: fieldsId,
        tenantId: tenantId,
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
    return response;
  }

  public async getFieldsContext(
    request: any,
    tenantId: string,
    context: string,
    contextId: string
  ) {
    try {
      var axios = require("axios");

      var data = {
        query: `query GetFields($context:String!, $contextId:uuid!, $tenantId:uuid!) {
          Fields(
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
      }`,
        variables: {
          context: context,
          contextId: contextId,
          tenantId: tenantId,
        },
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  async searchFields(request: any, tenantId: string, fieldsSearchDto: FieldsSearchDto) {
    try {
      var axios = require("axios");
      let offset = 0;
      if (fieldsSearchDto.page > 1) {
        offset = (fieldsSearchDto.limit) * (fieldsSearchDto.page - 1);
      }

      let temp_filters = fieldsSearchDto.filters;
      //add tenantid
      let filters = new Object(temp_filters);
      filters["tenantId"] = { _eq: tenantId ? tenantId : "" };

      Object.keys(fieldsSearchDto.filters).forEach((item) => {
        Object.keys(fieldsSearchDto.filters[item]).forEach((e) => {
          if (!e.startsWith("_")) {
            filters[item][`_${e}`] = filters[item][e];
            delete filters[item][e];
          }
        });
      });
      var data = {
        query: `query SearchFields($filters:Fields_bool_exp,$limit:Int, $offset:Int) {
            Fields(where:$filters, limit: $limit, offset: $offset,) {
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
              }
            }`,
        variables: {
          limit: (fieldsSearchDto.limit),
          offset: offset,
          filters: fieldsSearchDto.filters,
        },
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  async updateFields(fieldsId: string, fieldsDto: FieldsDto) {
    var axios = require("axios");

    // //add render json object
    // fieldsDto = await this.addRender(fieldsDto);

    let query = "";
    Object.keys(fieldsDto).forEach((e) => {
      if (fieldsDto[e] && fieldsDto[e] != "") {
        if (e === "render") {
          query += `${e}: ${fieldsDto[e]}, `;
        } else if (Array.isArray(fieldsDto[e])) {
          query += `${e}: "${JSON.stringify(fieldsDto[e])}", `;
        } else {
          query += `${e}: "${fieldsDto[e]}", `;
        }
      }
    });

    var data = {
      query: `
      mutation UpdateFields($fieldsId:uuid!) {
        update_Fields_by_pk(
            pk_columns: {
              fieldId: $fieldsId
            },
            _set: {
                ${query}
            }
        ) {
          fieldId
        }
    }
    `,
      variables: {
        fieldsId: fieldsId,
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

    return response;
  }

  // //required functions
  // public async addRender(fieldsDto: FieldsDto) {
  //   let fieldsDtoTemp = fieldsDto;
  //   if (fieldsDtoTemp?.render) {
  //     let renderObj = await this.createFieldSchema(fieldsDtoTemp?.render);
  //     fieldsDtoTemp.render = JSON.stringify(JSON.stringify(renderObj));
  //   }
  //   fieldsDto = fieldsDtoTemp;
  //   return fieldsDto;
  // }

  public async setTypeProperties(schema, payload) {
    switch (payload.type) {
      case "string":
      case "text":
        schema.coreSchema.type = "string";
        break;
      case "integer":
      case "number":
        schema.coreSchema.type = "integer";
        break;
      case "password":
        schema.coreSchema.type = "string";
        schema.uiSchema["ui:widget"] = "password";
        break;
      case "email":
        schema.coreSchema.type = "string";
        schema.uiSchema["ui:widget"] = "email";
        break;
      case "textarea":
        schema.coreSchema.type = "string";
        schema.uiSchema["ui:widget"] = "textarea";
        break;
      case "radio":
        schema.coreSchema.type = "boolean";
        schema.uiSchema["ui:widget"] = "radio";
        break;
      case "checkbox":
        schema.coreSchema.type = "array";
        if (payload.hasOwnProperty("items")) {
          schema.coreSchema.items = payload.items;
          schema.coreSchema.uniqueItems = payload.uniqueItems;
          schema.uiSchema["ui:widget"] = "checkboxes";
        }
        break;
      case "select":
        schema.coreSchema.type = payload.fieldType;
        if (
          payload.hasOwnProperty("enum") &&
          Array.isArray(payload.enum) &&
          payload.hasOwnProperty("labels") &&
          Array.isArray(payload.labels) &&
          payload.enum.length === payload.labels.length
        ) {
          schema.coreSchema.enum = payload.enum;
          schema.coreSchema.enumNames = payload.labels;
        }
        if (payload.hasOwnProperty("label")) {
          schema.coreSchema.title = payload.label;
        }
        break;
    }

    return schema;
  }

  public async createFieldSchema(payload) {
    let fieldSchema = {
      required: false,
      coreSchema: {},
      uiSchema: {},
    };
    fieldSchema = await this.setTypeProperties(fieldSchema, payload);
    if (payload.label) {
      fieldSchema.coreSchema["title"] = payload.label;
    }

    if (payload.pattern) {
      fieldSchema.coreSchema["pattern"] = payload.pattern;
    }

    if (payload.hasOwnProperty("minLength")) {
      fieldSchema.coreSchema["minLength"] = payload.minLength;
    }

    if (payload.hasOwnProperty("maxLength")) {
      fieldSchema.coreSchema["maxLength"] = payload.maxLength;
    }

    if (payload.defaultValue) {
      fieldSchema.coreSchema["default"] = payload.defaultValue;
    }
    if (payload.placeholder) {
      fieldSchema.uiSchema["ui:placeholder"] = payload.placeholder;
    }
    if (payload.hasOwnProperty("required")) {
      fieldSchema.required = true;
    }

    if (payload.hasOwnProperty("oneOf")) {
      fieldSchema.coreSchema["oneOf"] = payload.oneOf;
    }

    return {
      [payload.name]: fieldSchema,
    };
  }

  //field values
  async createFieldValues(request: any, fieldValuesDto: FieldValuesDto) {
    try {
      var axios = require("axios");

      let query = "";
      Object.keys(fieldValuesDto).forEach((e) => {
        if (fieldValuesDto[e] && fieldValuesDto[e] != "") {
          if (Array.isArray(fieldValuesDto[e])) {
            query += `${e}: "${JSON.stringify(fieldValuesDto[e])}", `;
          } else {
            query += `${e}: "${fieldValuesDto[e]}", `;
          }
        }
      });

      var data = {
        query: `mutation CreateFieldValues {
          insert_FieldValues_one(object: {${query}}) {
            fieldValuesId
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  async createFieldValuesBulk(field_values: any) {
    var axios = require("axios");

    var data_field_values = {
      query: `mutation insert_multiple_fieldValues($objects: [FieldValues_insert_input!]!) {
        insert_FieldValues(objects: $objects) {
          returning {
            fieldValuesId
          }
        }
      }
      `,
      variables: {
        objects: field_values,
      },
    };

    var config_field_value = {
      method: "post",
      url: process.env.REGISTRYHASURA,
      headers: {
        "x-hasura-admin-secret": process.env.REGISTRYHASURAADMINSECRET,
        "Content-Type": "application/json",
      },
      data: data_field_values,
    };

    const response = await axios(config_field_value);
    return response;
  }

  public async getFieldValues(id: any) {
    var axios = require("axios");

    var data = {
      query: `query GetFieldValues($id:uuid!) {
        FieldValues(
          where:{
            fieldValuesId:{
              _eq:$id
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
    }`,
      variables: {
        id: id,
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
    return response;
  }

  public async getFieldValuesFieldsItemId(field_id: string, item_id: string) {
    var axios = require("axios");

    var data = {
      query: `query GetFieldValuesItemId($field_id:uuid!,$item_id:uuid!) {
        FieldValues(
          where:{
            itemId:{
              _eq:$item_id
            },
            fieldId:{
              _eq:$field_id
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
    }`,
      variables: {
        field_id: field_id,
        item_id: item_id,
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
    return response;
  }

  async searchFieldValues(request: any, fieldValuesSearchDto: FieldValuesSearchDto) {
    try {
      var axios = require("axios");

      let offset = 0;
      if (fieldValuesSearchDto.page > 1) {
        offset =
          parseInt(fieldValuesSearchDto.limit) * (fieldValuesSearchDto.page - 1);
      }

      let filters = fieldValuesSearchDto.filters;

      Object.keys(fieldValuesSearchDto.filters).forEach((item) => {
        Object.keys(fieldValuesSearchDto.filters[item]).forEach((e) => {
          if (!e.startsWith("_")) {
            filters[item][`_${e}`] = filters[item][e];
            delete filters[item][e];
          }
        });
      });
      var data = {
        query: `query SearchFieldValues($filters:FieldValues_bool_exp,$limit:Int, $offset:Int) {
            FieldValues(where:$filters, limit: $limit, offset: $offset,) {
                value
                fieldValuesId
                itemId
                fieldId
                createdAt
                updatedAt
                createdBy
                updatedBy
              }
            }`,
        variables: {
          limit: parseInt(fieldValuesSearchDto.limit),
          offset: offset,
          filters: fieldValuesSearchDto.filters,
        },
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  async searchFieldValuesFilter(request: any, filter: any) {
    try {
      let obj_filter = [];
      Object.keys(filter).forEach((item) => {
        Object.keys(filter[item]).forEach((e) => {
          let obj_val = new Object();
          obj_val[e] = filter[item][e];
          obj_filter.push({
            fieldId: { _eq: item },
            value: obj_val,
          });
        });
      });

      let valuefilter = new Object({ _or: obj_filter });

      var axios = require("axios");

      var data = {
        query: `query SearchFieldValuesFilter($valuefilter:FieldValues_bool_exp) {
          FieldValues(
            where:$valuefilter
          ){
              itemId
        }
      }`,
        variables: { valuefilter: valuefilter },
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
      return response;
    } catch (e) {
      console.error(e);
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  async updateFieldValues(id: string, fieldValuesDto: FieldValuesDto) {
    var axios = require("axios");

    let query = "";
    Object.keys(fieldValuesDto).forEach((e) => {
      if (fieldValuesDto[e] && fieldValuesDto[e] != "") {
        if (Array.isArray(fieldValuesDto[e])) {
          query += `${e}: "${JSON.stringify(fieldValuesDto[e])}", `;
        } else {
          query += `${e}: "${fieldValuesDto[e]}", `;
        }
      }
    });

    var data = {
      query: `
      mutation UpdateFieldValues($id:uuid!) {
        update_FieldValues_by_pk(
            pk_columns: {
              fieldValuesId: $id
            },
            _set: {
                ${query}
            }
        ) {
            fieldValuesId
        }
    }
    `,
      variables: {
        id: id,
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

    return response;
  }
}