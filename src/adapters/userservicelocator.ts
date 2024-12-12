import { Response } from "express";
import { UserCreateDto } from "src/user/dto/user-create.dto";
import { UserSearchDto } from "src/user/dto/user-search.dto";
import { UserData } from "src/user/user.controller";

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
  updateUser(userDto?: any, response?: any);
  createUser(request: any, userDto: UserCreateDto, academicYearId: string, response: Response);
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
  checkUser(body: any, response);
  deleteUserById(userId: string, response: Response): Promise<any>;
  sendPasswordResetLink(request: any, username: string, redirectUrl: string, response: Response);
  forgotPassword(request: any, body: any, response: Response);
  sendOtp(body, response: Response);
  verifyOtp(body, response: Response)

}
