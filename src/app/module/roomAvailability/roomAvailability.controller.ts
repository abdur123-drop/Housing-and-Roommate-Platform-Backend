import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { RoomAvailabilityServices } from "./roomAvailability.service";
import { RoomAvailabilityValidation } from "./roomAvailability.validation";

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
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	return req.user;
};

const createAvailability = catchAsync(async (req: Request, res: Response) => {
	const { roomId } = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityRoomParamZodSchema,
		req.params,
	);
	const result = await RoomAvailabilityServices.createAvailability(
		roomId,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Room availability created successfully",
		data: result,
	});
});

const listAvailability = catchAsync(async (req: Request, res: Response) => {
	const { roomId } = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityRoomParamZodSchema,
		req.params,
	);
	const query = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityQueryZodSchema,
		req.query,
	);
	const { data, meta } = await RoomAvailabilityServices.listAvailability(
		roomId,
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room availability retrieved successfully",
		meta,
		data,
	});
});

const getAvailabilityById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityParamZodSchema,
		req.params,
	);
	const result = await RoomAvailabilityServices.getAvailabilityById(
		id,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room availability retrieved successfully",
		data: result,
	});
});

const updateAvailability = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityParamZodSchema,
		req.params,
	);
	const result = await RoomAvailabilityServices.updateAvailability(
		id,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room availability updated successfully",
		data: result,
	});
});

const deleteAvailability = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoomAvailabilityValidation.RoomAvailabilityParamZodSchema,
		req.params,
	);
	const result = await RoomAvailabilityServices.deleteAvailability(
		id,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room availability deleted successfully",
		data: result,
	});
});

export const RoomAvailabilityController = {
	createAvailability,
	listAvailability,
	getAvailabilityById,
	updateAvailability,
	deleteAvailability,
};
