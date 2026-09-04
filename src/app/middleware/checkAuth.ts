import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { JwtPayload } from "jsonwebtoken";
import type { TAppRole } from "../constants/roles";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

export interface RequestUser {
	email: string;
	name: string;
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

/**
 * auth(AppRole.OWNER, AppRole.ADMIN) -> passes when the user holds ANY of them.
 * auth() -> only requires a valid, existing user.
 */
export const auth = (...requiredRoles: TAppRole[]) => {
	return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		const token = req.cookies?.accessToken
			? req.cookies.accessToken
			: req.headers.authorization?.startsWith("Bearer ")
				? req.headers.authorization?.split(" ")[1]
				: req.headers.authorization;

		if (!token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

		if (!verifiedToken.success) {
			throw new AppError(httpStatus.UNAUTHORIZED, verifiedToken.error);
		}

		const { userId } = verifiedToken.data as JwtPayload;

		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { userRoles: { include: { role: true } } },
		});

		if (!user) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"User not found. Please log in again.",
			);
		}

		// Roles are read from the database rather than trusted from the token, so
		// a revoked role takes effect on the very next request.
		const roles = user.userRoles.map((ur) => ur.role.name as TAppRole);

		if (requiredRoles.length && !requiredRoles.some((r) => roles.includes(r))) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		req.user = {
			email: user.email,
			name: user.name,
			userId: user.id,
			roles,
		};

		next();
	});
};
