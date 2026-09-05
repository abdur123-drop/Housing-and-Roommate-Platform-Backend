import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { TApplicationAction } from "./application.interface";
import { ApplicationServices } from "./application.service";
import { ApplicationValidation } from "./application.validation";

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

const createApplication = catchAsync(async (req: Request, res: Response) => {
	const result = await ApplicationServices.createApplication(
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Application created successfully",
		data: result,
	});
});

const getMyApplications = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		ApplicationValidation.ApplicationQueryZodSchema,
		req.query,
	);
	const { data, meta } = await ApplicationServices.getMyApplications(
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "My applications retrieved successfully",
		meta,
		data,
	});
});

const getManagedApplications = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		ApplicationValidation.ApplicationQueryZodSchema,
		req.query,
	);
	const { data, meta } = await ApplicationServices.getManagedApplications(
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Managed applications retrieved successfully",
		meta,
		data,
	});
});

const getPropertyApplications = catchAsync(
	async (req: Request, res: Response) => {
		const { propertyId } = parseOrThrow(
			ApplicationValidation.ApplicationPropertyParamZodSchema,
			req.params,
		);
		const query = parseOrThrow(
			ApplicationValidation.ApplicationQueryZodSchema,
			req.query,
		);
		const { data, meta } = await ApplicationServices.getPropertyApplications(
			propertyId,
			query,
			getUser(req),
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Property applications retrieved successfully",
			meta,
			data,
		});
	},
);

const getApplicationById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		ApplicationValidation.ApplicationParamZodSchema,
		req.params,
	);
	const result = await ApplicationServices.getApplicationById(id, getUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Application retrieved successfully",
		data: result,
	});
});

const transition = (action: TApplicationAction) =>
	catchAsync(async (req: Request, res: Response) => {
		const { id } = parseOrThrow(
			ApplicationValidation.ApplicationParamZodSchema,
			req.params,
		);
		const result = await ApplicationServices.transitionApplication(
			id,
			action,
			getUser(req),
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: `Application ${action}ed successfully`,
			data: result,
		});
	});

export const ApplicationController = {
	createApplication,
	getMyApplications,
	getManagedApplications,
	getPropertyApplications,
	getApplicationById,
	approveApplication: transition("approve"),
	rejectApplication: transition("reject"),
	withdrawApplication: transition("withdraw"),
};
