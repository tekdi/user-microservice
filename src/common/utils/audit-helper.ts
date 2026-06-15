import { requestContext } from './request-context';

export const getAuditContext = () => {
  const request = requestContext.getStore() as any;
  return {
    actorId: request?.user?.userId || request?.user?.sub || "00000000-0000-0000-0000-000000000000",
    actorName: request?.user?.name || "System",
    userRole: request?.user?.role || "Unknown",
    ipAddress: request?.ip,
    userAgent: request?.headers?.["user-agent"]
  };
};
