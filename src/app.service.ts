import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): object {
    return { msg: "Welcome to Shiksha Backend" };
  }
}
