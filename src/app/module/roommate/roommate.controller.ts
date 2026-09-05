import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { RoommateServices } from "./roommate.service";
import { RoommateValidation } from "./roommate.validation";

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

const createProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.createProfile(req.body, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Roommate profile created successfully",
		data: result,
	});
});

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.getMyProfile(getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate profile retrieved successfully",
		data: result,
	});
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.updateMyProfile(req.body, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate profile updated successfully",
		data: result,
	});
});

const deleteMyProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.deleteMyProfile(getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate profile deleted successfully",
		data: result,
	});
});

const getProfileById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoommateValidation.RoommateIdParamZodSchema,
		req.params,
	);
	const result = await RoommateServices.getProfileById(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate profile retrieved successfully",
		data: result,
	});
});

const discoverRoommates = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		RoommateValidation.RoommateQueryZodSchema,
		req.query,
	);
	const { data, meta } = await RoommateServices.discoverRoommates(
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommates retrieved successfully",
		meta,
		data,
	});
});

const getMatches = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		RoommateValidation.RoommateMatchQueryZodSchema,
		req.query,
	);
	const { data, meta } = await RoommateServices.getMatches(query, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate matches retrieved successfully",
		meta,
		data,
	});
});

const getMyPreferences = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.getMyPreferences(getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate preferences retrieved successfully",
		data: result,
	});
});

const updateMyPreferences = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.updateMyPreferences(
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Roommate preferences updated successfully",
		data: result,
	});
});

const getPreferences = catchAsync(async (_req: Request, res: Response) => {
	const result = await RoommateServices.getPreferences();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Preferences retrieved successfully",
		data: result,
	});
});

const createPreference = catchAsync(async (req: Request, res: Response) => {
	const result = await RoommateServices.createPreference(
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Preference created successfully",
		data: result,
	});
});

const updatePreference = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoommateValidation.PreferenceIdParamZodSchema,
		req.params,
	);
	const result = await RoommateServices.updatePreference(
		id,
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Preference updated successfully",
		data: result,
	});
});

const deletePreference = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		RoommateValidation.PreferenceIdParamZodSchema,
		req.params,
	);
	const result = await RoommateServices.deletePreference(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Preference deleted successfully",
		data: result,
	});
});

export const RoommateController = {
	createProfile,
	getMyProfile,
	updateMyProfile,
	deleteMyProfile,
	getProfileById,
	discoverRoommates,
	getMatches,
	getMyPreferences,
	updateMyPreferences,
	getPreferences,
	createPreference,
	updatePreference,
	deletePreference,
};
