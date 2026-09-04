import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
// jsonwebtoken is CommonJS: its error classes are NOT available as ESM named
// exports, so they must be reached through the default export.
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";
import { AppError, type TErrorSource } from "../utils/AppError";

export const globalErrorHandler = async (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (config.node_env === "development") {
		console.log("Error from Global Error Handler", err);
	}

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage = err.message || "Internal Server Error";
	const errorName = err.name || "Internal Server Error";
	let errorSources: TErrorSource[] = [];

	if (err instanceof ZodError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "Validation failed";
		errorSources = err.issues.map((issue) => ({
			path: issue.path.join(".") || "body",
			message: issue.message,
		}));
	} else if (err instanceof jwt.TokenExpiredError) {
		statusCode = httpStatus.UNAUTHORIZED;
		errorMessage = "Your session has expired. Please log in again.";
	} else if (
		err instanceof jwt.NotBeforeError ||
		err instanceof jwt.JsonWebTokenError
	) {
		// Covers malformed, wrong-signature and not-yet-valid tokens alike. The
		// client is told nothing about which - that detail only helps an attacker.
		statusCode = httpStatus.UNAUTHORIZED;
		errorMessage = "Invalid authentication token.";
	} else if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.CONFLICT;
			errorMessage = "That value is already in use.";
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Foreign key constraint failed";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage =
				"An operation failed because it depends on one or more records that were required but not found.";
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occurred during query execution";
	} else if (err instanceof AppError) {
		errorMessage = err.message;
		statusCode = err.statusCode;
		errorSources = err.errorSources ?? [];
	} else if (err instanceof Error) {
		errorMessage = err.message;
	}

	const isDev = config.node_env === "development";
	// A 5xx is the only case where the message may describe internals, so it is
	// the only one we mask in production.
	const isServerError = statusCode >= 500;

	res.status(statusCode).json({
		success: false,
		statusCode,
		name: isDev ? errorName : undefined,
		message:
			isServerError && !isDev ? "Internal Server Error" : errorMessage,
		errors: errorSources,
		stack: isDev ? err.stack : undefined,
	});
};
