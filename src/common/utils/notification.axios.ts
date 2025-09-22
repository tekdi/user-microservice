import { HttpService } from "@nestjs/axios";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import axios, { AxiosRequestConfig } from "axios";
import { API_RESPONSES } from "./response.messages";

@Injectable()
export class NotificationRequest {
  private readonly url: string;
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.url = this.configService.get("NOTIFICATION_URL");
  }

  async sendNotification(body) {
    const data = JSON.stringify(body);
    const config: AxiosRequestConfig<any> = {
      method: "POST",
      maxBodyLength: Infinity,
      url: `${this.url}/notification/send`,
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };
    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new HttpException(
          API_RESPONSES.SERVICE_UNAVAILABLE,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      if (error.response) {
        const statusCode = error.response.status;
        const errorDetails = error.response.data || API_RESPONSES.ERROR;

        switch (statusCode) {
          case 400:
            throw new HttpException(
              `Bad Request: ${
                errorDetails.params?.errmsg || API_RESPONSES.BAD_REQUEST
              }`,
              HttpStatus.BAD_REQUEST
            );
          case 404:
            throw new HttpException(
              `Not Found: ${
                errorDetails.params?.errmsg || API_RESPONSES.NOT_FOUND
              }`,
              HttpStatus.NOT_FOUND
            );
          case 500:
            throw new HttpException(
              `Internal Server Error: ${
                errorDetails.params?.errmsg ||
                API_RESPONSES.INTERNAL_SERVER_ERROR
              }`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
          default:
            throw new HttpException(
              `Unexpected Error: ${
                errorDetails.params?.errmsg || API_RESPONSES.UNEXPECTED_ERROR
              }`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
      }
      throw new HttpException(
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async sendRawNotification(body) {
    const data = JSON.stringify(body);
    const config: AxiosRequestConfig<any> = {
      method: "POST",
      maxBodyLength: Infinity,
      url: `${this.url}/notification/send-raw`,
      headers: {
        "Content-Type": "application/json",
      },
      data: data,
    };
    try {
     console.log(`[DEBUG] WhatsApp payload being sent:`, JSON.stringify(body, null, 2));
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new HttpException(
          API_RESPONSES.SERVICE_UNAVAILABLE,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      if (error.response) {
        const statusCode = error.response.status;
        const errorDetails = error.response.data || API_RESPONSES.ERROR;
 
 
        switch (statusCode) {
          case 400:
            throw new HttpException(
              `Bad Request: ${
                errorDetails.params?.errmsg || API_RESPONSES.BAD_REQUEST
              }`,
              HttpStatus.BAD_REQUEST
            );
          case 404:
            throw new HttpException(
              `Not Found: ${
                errorDetails.params?.errmsg || API_RESPONSES.NOT_FOUND
              }`,
              HttpStatus.NOT_FOUND
            );
          case 500:
            throw new HttpException(
              `Internal Server Error: ${
                errorDetails.params?.errmsg ||
                API_RESPONSES.INTERNAL_SERVER_ERROR
              }`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
          default:
            throw new HttpException(
              `Unexpected Error: ${
                errorDetails.params?.errmsg || API_RESPONSES.UNEXPECTED_ERROR
              }`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
      }
      throw new HttpException(
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  async sendEmail(to: string, subject: string, message: string): Promise<any> {
    const emailPayload = {
      email: {
        to: [to],
        subject: subject,
        body: message,
      },
    };
    return this.sendRawNotification(emailPayload);
  }
}
