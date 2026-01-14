import { Response } from 'express';
import { OtpSendDTO } from 'src/user/dto/otpSend.dto';
import { UserCreateDto } from 'src/user/dto/user-create.dto';
import { UserSearchDto } from 'src/user/dto/user-search.dto';
import { OtpVerifyDTO } from 'src/user/dto/otpVerify.dto';
import { UserData } from 'src/user/user.controller';
import { SendPasswordResetOTPDto } from 'src/user/dto/passwordReset.dto';
import { UserUpdateDTO } from 'src/user/dto/user-update.dto';
import { UserCreateSsoDto } from 'src/user/dto/user-create-sso.dto';

export interface IServicelocator {
  // getUser(
  //   userId?:Record<string, string>,
  //   response?: any,
  //   tenantId?: string,
  //   id?: any,
  //   accessRole?: string,
  //   request?: any,
  // );
  getUsersDetailsById(userData: UserData, response: any, includeCustomFields?: boolean);
  updateUser(userDto?: UserUpdateDTO, response?: Response): Promise<void>;
  createUser(
    request: any,
    userDto: UserCreateDto,
    academicYearId: string,
    response: Response
  );
  createSsoUser(
    request: any,
    userDto: UserCreateSsoDto,
    academicYearId: string,
    response: Response
  );
  ssoCallback(code: any, request: any, response: Response);
  findUserDetails(userID: any, username: string, tenantId?: string);
  findUserStatusForLogin(username: string);
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
  checkUser(body: any, response);
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
