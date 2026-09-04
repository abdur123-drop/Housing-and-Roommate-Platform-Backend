import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UnitServices } from "./unit.service";
import { UnitValidation } from "./unit.validation";

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

const createUnit = catchAsync(async (req: Request, res: Response) => {
	const { buildingId } = parseOrThrow(
		UnitValidation.BuildingUnitParamZodSchema,
		req.params,
	);
	const result = await UnitServices.createUnit(
		buildingId,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Unit created successfully",
		data: result,
	});
});

const listUnits = catchAsync(async (req: Request, res: Response) => {
	const { buildingId } = parseOrThrow(
		UnitValidation.BuildingUnitParamZodSchema,
		req.params,
	);
	const query = parseOrThrow(UnitValidation.UnitQueryZodSchema, req.query);
	const { data, meta } = await UnitServices.listUnits(
		buildingId,
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Units retrieved successfully",
		meta,
		data,
	});
});

const getUnitById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(UnitValidation.UnitParamZodSchema, req.params);
	const result = await UnitServices.getUnitById(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Unit retrieved successfully",
		data: result,
	});
});

const updateUnit = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(UnitValidation.UnitParamZodSchema, req.params);
	const result = await UnitServices.updateUnit(id, req.body, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Unit updated successfully",
		data: result,
	});
});

const deleteUnit = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(UnitValidation.UnitParamZodSchema, req.params);
	const result = await UnitServices.deleteUnit(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Unit deleted successfully",
		data: result,
	});
});

export const UnitController = {
	createUnit,
	listUnits,
	getUnitById,
	updateUnit,
	deleteUnit,
};
