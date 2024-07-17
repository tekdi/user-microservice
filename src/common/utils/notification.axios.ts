import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import axios, { AxiosRequestConfig } from "axios";

@Injectable()
export class NotificationRequest {
    private readonly url: string;
    constructor(private readonly configService: ConfigService,
        private readonly httpService: HttpService) {
        this.url = this.configService.get('NOTIFICATION_URL');
    }

    async sendNotification(body) {
        const data = JSON.stringify(body);
        const config: AxiosRequestConfig<any> = {
            method: 'POST',
            maxBodyLength: Infinity,
            url: this.url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: data,
        };
        try {
            const response = await axios.request(config)
            console.log(response.data);
            return response.data;
        } catch (error) {
            // throw error;
            return null
        }
    }
}