import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PropertyServices } from "./property.service";
import { PropertyValidation } from "./property.validation";

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

const getRequestUser = (req: Request): RequestUser => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	return req.user;
};

const createProperty = catchAsync(async (req: Request, res: Response) => {
	const result = await PropertyServices.createProperty(
		req.body,
		getRequestUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Property created successfully",
		data: result,
	});
});

const getProperties = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		PropertyValidation.PropertyQueryZodSchema,
		req.query,
	);
	const { data, meta } = await PropertyServices.getProperties(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Properties retrieved successfully",
		meta,
		data,
	});
});

const getMyProperties = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		PropertyValidation.PropertyQueryZodSchema,
		req.query,
	);
	const { data, meta } = await PropertyServices.getMyProperties(
		query,
		getRequestUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "My properties retrieved successfully",
		meta,
		data,
	});
});

const getPropertyById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(PropertyValidation.PropertyIdParamZodSchema, {
		id: req.params.id,
	});
	const result = await PropertyServices.getPropertyById(id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Property retrieved successfully",
		data: result,
	});
});

const updateProperty = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(PropertyValidation.PropertyIdParamZodSchema, {
		id: req.params.id,
	});
	const result = await PropertyServices.updateProperty(
		id,
		req.body,
		getRequestUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Property updated successfully",
		data: result,
	});
});

const deleteProperty = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(PropertyValidation.PropertyIdParamZodSchema, {
		id: req.params.id,
	});
	const result = await PropertyServices.deleteProperty(id, getRequestUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Property deleted successfully",
		data: result,
	});
});

const assignManager = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(PropertyValidation.PropertyIdParamZodSchema, {
		id: req.params.id,
	});
	const result = await PropertyServices.assignManager(
		id,
		req.body,
		getRequestUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Property manager updated successfully",
		data: result,
	});
});

export const PropertyController = {
	createProperty,
	getProperties,
	getMyProperties,
	getPropertyById,
	updateProperty,
	deleteProperty,
	assignManager,
};
