import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { z } from "zod";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { TViewingRequestAction } from "./viewingRequest.interface";
import { ViewingRequestServices } from "./viewingRequest.service";
import { ViewingRequestValidation } from "./viewingRequest.validation";

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

const createViewingRequest = catchAsync(async (req: Request, res: Response) => {
	const result = await ViewingRequestServices.createViewingRequest(
		req.body,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Viewing request created successfully",
		data: result,
	});
});

const getMyViewingRequests = catchAsync(async (req: Request, res: Response) => {
	const query = parseOrThrow(
		ViewingRequestValidation.ViewingRequestQueryZodSchema,
		req.query,
	);
	const { data, meta } = await ViewingRequestServices.getMyViewingRequests(
		query,
		getUser(req),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "My viewing requests retrieved successfully",
		meta,
		data,
	});
});

const getManagedViewingRequests = catchAsync(
	async (req: Request, res: Response) => {
		const query = parseOrThrow(
			ViewingRequestValidation.ViewingRequestQueryZodSchema,
			req.query,
		);
		const { data, meta } =
			await ViewingRequestServices.getManagedViewingRequests(
				query,
				getUser(req),
			);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Managed viewing requests retrieved successfully",
			meta,
			data,
		});
	},
);

const getPropertyViewingRequests = catchAsync(
	async (req: Request, res: Response) => {
		const { propertyId } = parseOrThrow(
			ViewingRequestValidation.ViewingRequestPropertyParamZodSchema,
			req.params,
		);
		const query = parseOrThrow(
			ViewingRequestValidation.ViewingRequestQueryZodSchema,
			req.query,
		);
		const { data, meta } =
			await ViewingRequestServices.getPropertyViewingRequests(
				propertyId,
				query,
				getUser(req),
			);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Property viewing requests retrieved successfully",
			meta,
			data,
		});
	},
);

const getViewingRequestById = catchAsync(
	async (req: Request, res: Response) => {
		const { id } = parseOrThrow(
			ViewingRequestValidation.ViewingRequestParamZodSchema,
			req.params,
		);
		const result = await ViewingRequestServices.getViewingRequestById(
			id,
			getUser(req),
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Viewing request retrieved successfully",
			data: result,
		});
	},
);

const transition = (action: TViewingRequestAction) =>
	catchAsync(async (req: Request, res: Response) => {
		const { id } = parseOrThrow(
			ViewingRequestValidation.ViewingRequestParamZodSchema,
			req.params,
		);
		const result = await ViewingRequestServices.transitionViewingRequest(
			id,
			action,
			getUser(req),
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: `Viewing request ${action}ed successfully`,
			data: result,
		});
	});

export const ViewingRequestController = {
	createViewingRequest,
	getMyViewingRequests,
	getManagedViewingRequests,
	getPropertyViewingRequests,
	getViewingRequestById,
	approveViewingRequest: transition("approve"),
	rejectViewingRequest: transition("reject"),
	cancelViewingRequest: transition("cancel"),
};
