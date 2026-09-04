import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import config from "../config";
import { APP_ROLES, type TAppRole } from "../constants/roles";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

let authPrisma = prisma;

export const setAuthPrismaForTest = (client: typeof prisma): void => {
	authPrisma = client;
};

export const resetAuthPrismaForTest = (): void => {
	authPrisma = prisma;
};

export interface RequestUser {
	id: string;
	email: string;
	userId: string;
	/** A user can hold several roles at once (see `user_roles`). */
	roles: TAppRole[];
}

declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

/** Pulls a bearer token from the Authorization header or the accessToken cookie. */
const extractToken = (req: Request): string | undefined => {
	const header = req.headers.authorization;

	if (header?.startsWith("Bearer ")) {
		const token = header.slice(7).trim();
		return token.length ? token : undefined;
	}

	const cookieToken = req.cookies?.accessToken;
	return typeof cookieToken === "string" && cookieToken.length
		? cookieToken
		: undefined;
};

/**
 * auth(AppRole.OWNER, AppRole.ADMIN) -> passes when the user holds ANY of them.
 * auth() -> only requires a valid, active user.
 *
 * Identity comes from the JWT, but everything else comes from the database:
 * the user must still exist, must not be soft-deleted, and their roles are
 * re-read on every request. Nothing in the token payload is trusted for
 * authorization, so revoking a role or deleting a user takes effect on the very
 * next request instead of whenever the access token happens to expire.
 *
 * NOTE: role *checks* here are coarse (does the user hold this role at all).
 * Resource-level authorization - "is this OWNER the owner of THIS property" -
 * is Step 5 work.
 */
export const auth = (...requiredRoles: TAppRole[]) => {
	return catchAsync(
		async (req: Request, _res: Response, next: NextFunction) => {
			const token = extractToken(req);

			if (!token) {
				throw new AppError(
					httpStatus.UNAUTHORIZED,
					"You are not logged in. Please log in to access this resource.",
				);
			}

			// Covers expired, malformed, wrong-signature and tampered tokens.
			const verified = jwtUtils.verifyToken(token, config.jwt_access_secret);

			if (!verified.success) {
				throw new AppError(httpStatus.UNAUTHORIZED, verified.error);
			}

			const userId = verified.data.userId ?? verified.data.sub;

			if (typeof userId !== "string" || !userId) {
				throw new AppError(
					httpStatus.UNAUTHORIZED,
					"Invalid authentication token.",
				);
			}

			// A refresh token must never be accepted as an access token: they are
			// signed with different secrets, but this makes the intent explicit.
			if (verified.data.type && verified.data.type !== "access") {
				throw new AppError(
					httpStatus.UNAUTHORIZED,
					"Invalid authentication token.",
				);
			}

			// findFirst, not findUnique: a soft-deleted user must be invisible here,
			// and `deletedAt` is not part of any unique key.
			const user = await authPrisma.user.findFirst({
				where: { id: userId, deletedAt: null },
				select: {
					id: true,
					email: true,
					userRoles: { select: { role: { select: { name: true } } } },
				},
			});

			// Deleted and non-existent users are reported identically.
			if (!user) {
				throw new AppError(
					httpStatus.UNAUTHORIZED,
					"User not found. Please log in again.",
				);
			}

			const roles = user.userRoles.map((ur) => ur.role.name as TAppRole);

			if (!roles.length) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Your account has no role assigned. Please contact support.",
				);
			}

			if (requiredRoles.some((role) => !APP_ROLES.includes(role))) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You don't have permission to access this resource.",
				);
			}

			if (
				requiredRoles.length &&
				!requiredRoles.some((r) => roles.includes(r))
			) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You don't have permission to access this resource.",
				);
			}

			req.user = {
				id: user.id,
				email: user.email,
				userId: user.id,
				roles,
			};

			next();
		},
	);
};
