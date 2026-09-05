import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UtilityBillServices } from "./utilityBill.service";
import { UtilityBillValidation } from "./utilityBill.validation";

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

const createUtilityBill = catchAsync(async (req: Request, res: Response) => {
	const result = await UtilityBillServices.createUtilityBill(
		parseOrThrow(UtilityBillValidation.CreateUtilityBillZodSchema, req.body),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Utility bill created successfully",
		data: result,
	});
});

const getMyBills = catchAsync(async (req: Request, res: Response) => {
	const result = await UtilityBillServices.getMyBills(
		parseOrThrow(UtilityBillValidation.UtilityBillQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Utility bills retrieved successfully",
		...result,
	});
});

const getManagedBills = catchAsync(async (req: Request, res: Response) => {
	const result = await UtilityBillServices.getManagedBills(
		parseOrThrow(UtilityBillValidation.UtilityBillQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Managed utility bills retrieved successfully",
		...result,
	});
});

const getUtilityBillById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		UtilityBillValidation.UtilityBillParamZodSchema,
		req.params,
	);
	const result = await UtilityBillServices.getUtilityBillById(id, getUser(req));
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Utility bill retrieved successfully",
		data: result,
	});
});

const createSplit = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		UtilityBillValidation.UtilityBillParamZodSchema,
		req.params,
	);
	const result = await UtilityBillServices.createSplit(
		id,
		parseOrThrow(UtilityBillValidation.CreateUtilitySplitZodSchema, req.body),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Utility bill split created successfully",
		data: result,
	});
});

const getSplits = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		UtilityBillValidation.UtilityBillParamZodSchema,
		req.params,
	);
	const result = await UtilityBillServices.getSplits(id, getUser(req));
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Utility bill splits retrieved successfully",
		data: result,
	});
});

export const UtilityBillController = {
	createUtilityBill,
	getMyBills,
	getManagedBills,
	getUtilityBillById,
	createSplit,
	getSplits,
};
