import type { CookieOptions, Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAuthTokens, IRequestContext } from "./auth.interface";
import { AuthService } from "./auth.service";

const REFRESH_COOKIE = "refreshToken";
const ACCESS_COOKIE = "accessToken";

/**
 * Cookie flags are environment-aware:
 *  - `secure` + `sameSite: "none"` in production, where the API and the SPA are
 *    on different origins over HTTPS;
 *  - `sameSite: "lax"` without `secure` in development, because a Secure cookie
 *    is silently dropped over plain http://localhost.
 * `httpOnly` is unconditional so JavaScript can never read the token.
 */
const cookieBase = (): CookieOptions => ({
	httpOnly: true,
	secure: config.isProduction,
	sameSite: config.isProduction ? "none" : "lax",
});

/**
 * Scoped to /api/v1/auth so the refresh token is only ever transmitted to the
 * endpoints that need it, rather than riding along on every API call.
 */
const refreshCookieOptions = (): CookieOptions => ({
	...cookieBase(),
	path: "/api/v1/auth",
});

const setAuthCookies = (res: Response, tokens: IAuthTokens): void => {
	res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
	// Convenience for browser clients; the canonical delivery is the JSON body
	// plus an Authorization header. Not HttpOnly-critical, but kept HttpOnly so
	// XSS cannot read it either.
	res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...cookieBase(), path: "/" });
};

const clearAuthCookies = (res: Response): void => {
	res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
	res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: "/" });
};

const requestContext = (req: Request): IRequestContext => ({
	ip: req.ip,
	userAgent: req.headers["user-agent"],
});

/** Cookie first, body second - browsers use the HttpOnly cookie. */
const readRefreshToken = (req: Request): string | undefined =>
	req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;

const register = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.register(req.body, requestContext(req));

	setAuthCookies(res, result.tokens);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Registration successful",
		// The refresh token is deliberately absent: it lives only in the
		// HttpOnly cookie.
		data: { user: result.user, accessToken: result.tokens.accessToken },
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.login(req.body, requestContext(req));

	setAuthCookies(res, result.tokens);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Login successful",
		data: { user: result.user, accessToken: result.tokens.accessToken },
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.refreshTokens(
		readRefreshToken(req),
		requestContext(req),
	);

	setAuthCookies(res, result.tokens);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Token refreshed successfully",
		data: { user: result.user, accessToken: result.tokens.accessToken },
	});
});

const logout = catchAsync(async (req: Request, res: Response) => {
	await AuthService.logout(readRefreshToken(req));

	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged out successfully",
		data: null,
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in.");
	}

	const user = await AuthService.getMe(req.user.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Authenticated user retrieved successfully",
		data: user,
	});
});

export const AuthController = {
	register,
	login,
	refreshToken,
	logout,
	getMe,
};
