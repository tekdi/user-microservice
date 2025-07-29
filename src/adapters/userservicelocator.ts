import { Request, Response } from "express";
import { OtpSendDTO } from "src/user/dto/otpSend.dto";
import { UserCreateDto } from "src/user/dto/user-create.dto";
import {
  ExistUserDto,
  SuggestUserDto,
  UserSearchDto,
} from "src/user/dto/user-search.dto";
import { OtpVerifyDTO } from "src/user/dto/otpVerify.dto";
import { UserData } from "src/user/user.controller";
import { SendPasswordResetOTPDto } from "src/user/dto/passwordReset.dto";
import { UserUpdateDTO } from "src/user/dto/user-update.dto";

export interface IServicelocator {
  // getUser(
  //   userId?:Record<string, string>,
  //   response?: any,
  //   tenantId?: string,
  //   id?: any,
  //   accessRole?: string,
  //   request?: any,
  // );
  getUsersDetailsById(userData: UserData, response: any);
  updateUser(userDto?: UserUpdateDTO, response?: Response): Promise<void>;
  createUser(
    request: any,
    userDto: UserCreateDto,
    academicYearId: string,
    response: Response
  );
  findUserDetails(userID: any, username: string, tenantId?: string);
  searchUser(
    tenantId: string,
    request: any,
    response: any,
    userSearchDto: UserSearchDto
  );
  resetUserPassword(
    request: any,
    username: string,
    newPassword: string,
    response: Response
  );
  checkUser(request: Request, response: Response, existUserDto: ExistUserDto);
  suggestUsername(
    request: Request,
    response: Response,
    suggestUserDto: SuggestUserDto
  );
  deleteUserById(userId: string, response: Response): Promise<any>;
  sendPasswordResetLink(
    request: any,
    username: string,
    redirectUrl: string,
    response: Response
  );
  forgotPassword(request: any, body: any, response: Response);
  sendOtp(body: OtpSendDTO, response: Response): Promise<any>;
  verifyOtp(body: OtpVerifyDTO, response: Response): Promise<any>;
  sendPasswordResetOTP(
    body: SendPasswordResetOTPDto,
    response: Response
  ): Promise<any>;
}
