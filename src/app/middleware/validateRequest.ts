import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type z from "zod";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

/**
 * Validates (and replaces) `req.body` with the parsed result, so downstream
 * handlers only ever see normalized data - e.g. a lower-cased, trimmed email.
 *
 * Reports EVERY Zod issue rather than only the first, so a client fixing a form
 * does not have to submit repeatedly to discover one problem at a time.
 */
export const validateRequest = (zodSchema: z.ZodType) => {
	return catchAsync((req: Request, _res: Response, next: NextFunction) => {
		const result = zodSchema.safeParse(req.body ?? {});

		if (!result.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Validation failed",
				result.error.issues.map((issue) => ({
					path: issue.path.join(".") || "body",
					message: issue.message,
				})),
			);
		}

		req.body = result.data;

		next();
	});
};
