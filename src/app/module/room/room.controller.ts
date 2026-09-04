import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { RoomServices } from "./room.service";
import { RoomValidation } from "./room.validation";

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

const createRoom = catchAsync(async (req: Request, res: Response) => {
	const { unitId } = parseOrThrow(
		RoomValidation.UnitRoomParamZodSchema,
		req.params,
	);
	const result = await RoomServices.createRoom(unitId, req.body, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Room created successfully",
		data: result,
	});
});

const listRooms = catchAsync(async (req: Request, res: Response) => {
	const { unitId } = parseOrThrow(
		RoomValidation.UnitRoomParamZodSchema,
		req.params,
	);
	const query = parseOrThrow(RoomValidation.RoomQueryZodSchema, req.query);
	const { data, meta } = await RoomServices.listRooms(
		unitId,
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Rooms retrieved successfully",
		meta,
		data,
	});
});

const getRoomById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(RoomValidation.RoomParamZodSchema, req.params);
	const result = await RoomServices.getRoomById(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room retrieved successfully",
		data: result,
	});
});

const updateRoom = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(RoomValidation.RoomParamZodSchema, req.params);
	const result = await RoomServices.updateRoom(id, req.body, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room updated successfully",
		data: result,
	});
});

const deleteRoom = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(RoomValidation.RoomParamZodSchema, req.params);
	const result = await RoomServices.deleteRoom(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Room deleted successfully",
		data: result,
	});
});

export const RoomController = {
	createRoom,
	listRooms,
	getRoomById,
	updateRoom,
	deleteRoom,
};
