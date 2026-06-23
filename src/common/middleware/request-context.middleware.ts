import { Injectable, NestMiddleware } from '@nestjs/common';
import { requestContext } from '../utils/request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    requestContext.run(req, next);
  }
}
