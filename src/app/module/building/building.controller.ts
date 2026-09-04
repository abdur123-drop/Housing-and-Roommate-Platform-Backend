import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { BuildingServices } from "./building.service";
import { BuildingValidation } from "./building.validation";

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

const createBuilding = catchAsync(async (req: Request, res: Response) => {
	const { propertyId } = parseOrThrow(
		BuildingValidation.PropertyBuildingParamZodSchema,
		req.params,
	);
	const result = await BuildingServices.createBuilding(
		propertyId,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Building created successfully",
		data: result,
	});
});

const listBuildings = catchAsync(async (req: Request, res: Response) => {
	const { propertyId } = parseOrThrow(
		BuildingValidation.PropertyBuildingParamZodSchema,
		req.params,
	);
	const query = parseOrThrow(
		BuildingValidation.BuildingQueryZodSchema,
		req.query,
	);
	const { data, meta } = await BuildingServices.listBuildings(
		propertyId,
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Buildings retrieved successfully",
		meta,
		data,
	});
});

const getBuildingById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		BuildingValidation.BuildingParamZodSchema,
		req.params,
	);
	const result = await BuildingServices.getBuildingById(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Building retrieved successfully",
		data: result,
	});
});

const updateBuilding = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		BuildingValidation.BuildingParamZodSchema,
		req.params,
	);
	const result = await BuildingServices.updateBuilding(
		id,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Building updated successfully",
		data: result,
	});
});

const deleteBuilding = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		BuildingValidation.BuildingParamZodSchema,
		req.params,
	);
	const result = await BuildingServices.deleteBuilding(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Building deleted successfully",
		data: result,
	});
});

export const BuildingController = {
	createBuilding,
	listBuildings,
	getBuildingById,
	updateBuilding,
	deleteBuilding,
};
