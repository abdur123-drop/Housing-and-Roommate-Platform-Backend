import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { MaintenanceRequestServices } from "./maintenanceRequest.service";
import { MaintenanceRequestValidation } from "./maintenanceRequest.validation";

const parseOrThrow = <T>(schema: z.ZodType<T>, value: unknown): T => {
	const result = schema.safeParse(value);
	if (!result.success)
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Validation failed",
			result.error.issues.map((issue) => ({
				path: issue.path.join(".") || "request",
				message: issue.message,
			})),
		);
	return result.data;
};

const getUser = (req: Request): RequestUser => {
	if (!req.user)
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	return req.user;
};

const createRequest = catchAsync(async (req: Request, res: Response) => {
	const result = await MaintenanceRequestServices.createMaintenanceRequest(
		parseOrThrow(
			MaintenanceRequestValidation.CreateMaintenanceRequestZodSchema,
			req.body,
		),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Maintenance request created successfully",
		data: result,
	});
});

const getMyRequests = catchAsync(async (req: Request, res: Response) => {
	const result = await MaintenanceRequestServices.getMyRequests(
		parseOrThrow(
			MaintenanceRequestValidation.MaintenanceRequestQueryZodSchema,
			req.query,
		),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Maintenance requests retrieved successfully",
		...result,
	});
});

const getManagedRequests = catchAsync(async (req: Request, res: Response) => {
	const result = await MaintenanceRequestServices.getManagedRequests(
		parseOrThrow(
			MaintenanceRequestValidation.MaintenanceRequestQueryZodSchema,
			req.query,
		),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Managed maintenance requests retrieved successfully",
		...result,
	});
});

const getRequestById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		MaintenanceRequestValidation.MaintenanceRequestParamZodSchema,
		req.params,
	);
	const result = await MaintenanceRequestServices.getRequestById(
		id,
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Maintenance request retrieved successfully",
		data: result,
	});
});

const updateRequest = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		MaintenanceRequestValidation.MaintenanceRequestParamZodSchema,
		req.params,
	);
	const result = await MaintenanceRequestServices.updateRequest(
		id,
		parseOrThrow(
			MaintenanceRequestValidation.UpdateMaintenanceRequestZodSchema,
			req.body,
		),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Maintenance request updated successfully",
		data: result,
	});
});

const transition = (action: "start" | "resolve" | "close") =>
	catchAsync(async (req: Request, res: Response) => {
		const { id } = parseOrThrow(
			MaintenanceRequestValidation.MaintenanceRequestParamZodSchema,
			req.params,
		);
		const result = await MaintenanceRequestServices.transitionRequest(
			id,
			action,
			getUser(req),
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: `Maintenance request ${action}ed successfully`,
			data: result,
		});
	});

export const MaintenanceRequestController = {
	createRequest,
	getMyRequests,
	getManagedRequests,
	getRequestById,
	updateRequest,
	startRequest: transition("start"),
	resolveRequest: transition("resolve"),
	closeRequest: transition("close"),
};
