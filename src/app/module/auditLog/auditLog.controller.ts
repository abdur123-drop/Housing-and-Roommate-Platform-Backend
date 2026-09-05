import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuditLogServices } from "./auditLog.service";
import { AuditLogValidation } from "./auditLog.validation";

const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const result = AuditLogValidation.AuditLogQueryZodSchema.safeParse(req.query);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Validation failed",
			result.error.issues.map((issue) => ({
				path: issue.path.join(".") || "query",
				message: issue.message,
			})),
		);
	}
	const data = await AuditLogServices.listAuditLogs(result.data);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Audit logs retrieved successfully",
		...data,
	});
});

export const AuditLogController = { listAuditLogs };
