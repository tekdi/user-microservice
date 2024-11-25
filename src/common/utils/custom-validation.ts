import { BadRequestException } from "@nestjs/common";
import { isUUID } from "class-validator";
import { API_RESPONSES } from "./response.messages";
// import { ERROR_MESSAGES } from "./constants.util";

export const checkValidUserId = (userId: any): string => {
    if (typeof userId !== 'string') {
        throw new BadRequestException(API_RESPONSES.PROVIDE_ONE_USERID_IN_QUERY);
    }
    if (!userId || !isUUID(userId)) {
        throw new BadRequestException(API_RESPONSES.USERID_INVALID);
    }
    return userId;
};