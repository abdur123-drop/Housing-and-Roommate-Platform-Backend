import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { LeaseServices } from "./lease.service";
import { LeaseValidation } from "./lease.validation";

const parseOrThrow = <T>(schema: z.ZodType<T>, value: unknown): T => {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Validation failed",
			result.error.issues.map((issue) => ({
				path: issue.path.join(".") || "request",
				message: issue.message,
			})),
		);
	}
	return result.data;
};

const getUser = (req: Request): RequestUser => {
	if (!req.user)
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	return req.user;
};

const createLease = catchAsync(async (req: Request, res: Response) => {
	const result = await LeaseServices.createLease(
		parseOrThrow(LeaseValidation.CreateLeaseZodSchema, req.body),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Lease created successfully",
		data: result,
	});
});

const getMyLeases = catchAsync(async (req: Request, res: Response) => {
	const result = await LeaseServices.getMyLeases(
		parseOrThrow(LeaseValidation.LeaseQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Leases retrieved successfully",
		...result,
	});
});

const getManagedLeases = catchAsync(async (req: Request, res: Response) => {
	const result = await LeaseServices.getManagedLeases(
		parseOrThrow(LeaseValidation.LeaseQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Managed leases retrieved successfully",
		...result,
	});
});

const getLeaseById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(LeaseValidation.LeaseParamZodSchema, req.params);
	const result = await LeaseServices.getLeaseById(id, getUser(req));
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Lease retrieved successfully",
		data: result,
	});
});

const terminateLease = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(LeaseValidation.LeaseParamZodSchema, req.params);
	const result = await LeaseServices.terminateLease(id, getUser(req));
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Lease terminated successfully",
		data: result,
	});
});

export const LeaseController = {
	createLease,
	getMyLeases,
	getManagedLeases,
	getLeaseById,
	terminateLease,
};
