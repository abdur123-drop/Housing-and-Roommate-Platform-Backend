import type { Request, Response } from "express";
import httpStatus from "http-status";
import Stripe from "stripe";
import type { z } from "zod";
import { getStripeWebhookSecret } from "../../lib/stripe";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentServices } from "./payment.service";
import { PaymentValidation } from "./payment.validation";

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

const getIdempotencyKey = (req: Request): string => {
	const value = req.header("Idempotency-Key")?.trim();
	if (!value || value.length > 255)
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Idempotency-Key header is required",
		);
	return value;
};

const createPayment = catchAsync(async (req: Request, res: Response) => {
	const payload = parseOrThrow(
		PaymentValidation.CreatePaymentZodSchema,
		req.body,
	);
	const result = await PaymentServices.createPayment(
		{ ...payload, idempotencyKey: getIdempotencyKey(req) },
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Stripe payment initialized successfully",
		data: result,
	});
});

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentServices.getMyPayments(
		parseOrThrow(PaymentValidation.PaymentQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payments retrieved successfully",
		...result,
	});
});

const getManagedPayments = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentServices.getManagedPayments(
		parseOrThrow(PaymentValidation.PaymentQueryZodSchema, req.query),
		getUser(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Managed payments retrieved successfully",
		...result,
	});
});

const getPaymentById = catchAsync(async (req: Request, res: Response) => {
	const { id } = parseOrThrow(
		PaymentValidation.PaymentParamZodSchema,
		req.params,
	);
	const result = await PaymentServices.getPaymentById(id, getUser(req));
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment retrieved successfully",
		data: result,
	});
});

const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
	const signature = req.header("stripe-signature");
	if (!signature)
		throw new AppError(httpStatus.BAD_REQUEST, "Stripe signature is required");
	if (!Buffer.isBuffer(req.body))
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Raw Stripe webhook body is required",
		);
	let event: Stripe.Event;
	try {
		event = Stripe.webhooks.constructEvent(
			req.body,
			signature,
			getStripeWebhookSecret(),
		);
	} catch {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Invalid Stripe webhook signature",
		);
	}
	await PaymentServices.handleStripeWebhook(event);
	res.status(httpStatus.OK).json({ received: true });
});

export const PaymentController = {
	createPayment,
	getMyPayments,
	getManagedPayments,
	getPaymentById,
	stripeWebhook,
};
