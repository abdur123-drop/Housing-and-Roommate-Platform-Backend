import crypto from "node:crypto";
import httpStatus from "http-status";
import type { TAppRole } from "../../constants/roles";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import {
	comparePassword,
	hashPassword,
	wastePasswordCompareTime,
} from "../../utils/password";
import type {
	IAuthResult,
	IAuthTokens,
	IAuthUser,
	ILoginPayload,
	IRegisterPayload,
	IRequestContext,
} from "./auth.interface";

/**
 * One message for every login failure - unknown email, wrong password, or a
 * soft-deleted account. Distinguishing them would turn the login form into an
 * account-enumeration oracle.
 */
const INVALID_CREDENTIALS = "Invalid email or password";

const userSelect = {
	id: true,
	name: true,
	email: true,
	phone: true,
	avatar: true,
	createdAt: true,
	userRoles: { select: { role: { select: { name: true } } } },
} as const;

type UserWithRoles = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	avatar: string | null;
	createdAt: Date;
	userRoles: { role: { name: string } }[];
};

const toAuthUser = (user: UserWithRoles): IAuthUser => ({
	id: user.id,
	name: user.name,
	email: user.email,
	phone: user.phone,
	avatar: user.avatar,
	createdAt: user.createdAt,
	roles: user.userRoles.map((ur) => ur.role.name as TAppRole),
});

/**
 * SHA-256, not bcrypt. A refresh token is already 200+ bits of signed random
 * data, so key-stretching buys nothing, and bcrypt would silently truncate the
 * JWT at 72 bytes - making distinct tokens collide.
 */
const hashToken = (token: string): string =>
	crypto.createHash("sha256").update(token).digest("hex");

const issueAccessToken = (userId: string, roles: TAppRole[]): string =>
	jwtUtils.generateToken(
		{
			sub: userId,
			userId,
			type: "access",
			// Advisory only, for clients rendering UI. checkAuth ignores this and
			// re-reads roles from the database on every request.
			roles,
			jti: crypto.randomUUID(),
		},
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);

/**
 * Signs a refresh token and persists only its hash. The raw token is returned
 * to the caller and never stored anywhere on the server.
 */
const issueRefreshToken = async (
	userId: string,
	context: IRequestContext,
	tx: Pick<typeof prisma, "refreshToken"> = prisma,
): Promise<{ token: string; id: string }> => {
	const token = jwtUtils.generateToken(
		{ sub: userId, userId, type: "refresh", jti: crypto.randomUUID() },
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in,
	);

	const record = await tx.refreshToken.create({
		data: {
			userId,
			tokenHash: hashToken(token),
			expiresAt: jwtUtils.getExpiryDate(token),
			createdByIp: context.ip?.slice(0, 45),
			userAgent: context.userAgent?.slice(0, 255),
		},
		select: { id: true },
	});

	return { token, id: record.id };
};

const register = async (
	payload: IRegisterPayload,
	context: IRequestContext,
): Promise<IAuthResult> => {
	const { name, email, password, phone, role } = payload;

	// findFirst, not findUnique: users.email is unique only among live rows
	// (partial index `users_email_active_key`), so a soft-deleted account's
	// address is legitimately available again.
	const existing = await prisma.user.findFirst({
		where: { email, deletedAt: null },
		select: { id: true },
	});

	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An account with this email already exists",
			[{ path: "email", message: "This email is already registered" }],
		);
	}

	const roleRecord = await prisma.role.findUnique({
		where: { name: role },
		select: { id: true },
	});

	if (!roleRecord) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`Role ${role} is not configured. Roles are seeded on server start.`,
		);
	}

	const hashedPassword = await hashPassword(password);

	// User creation and the first refresh token are one transaction: a failure
	// midway must not leave a registered account the client cannot use.
	const { user, refresh } = await prisma.$transaction(async (tx) => {
		const created = await tx.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				phone,
				userRoles: { create: { roleId: roleRecord.id } },
			},
			select: userSelect,
		});

		const issued = await issueRefreshToken(created.id, context, tx);

		return { user: created, refresh: issued };
	});

	const authUser = toAuthUser(user);

	return {
		user: authUser,
		tokens: {
			accessToken: issueAccessToken(authUser.id, authUser.roles),
			refreshToken: refresh.token,
		},
	};
};

const login = async (
	payload: ILoginPayload,
	context: IRequestContext,
): Promise<IAuthResult> => {
	const { email, password } = payload;

	const user = await prisma.user.findFirst({
		where: { email, deletedAt: null },
		select: { ...userSelect, password: true },
	});

	if (!user) {
		// Burn comparable CPU time so "no such account" is not measurably faster
		// than "wrong password".
		await wastePasswordCompareTime();
		throw new AppError(httpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
	}

	const passwordMatches = await comparePassword(password, user.password);

	if (!passwordMatches) {
		throw new AppError(httpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
	}

	const authUser = toAuthUser(user);

	if (!authUser.roles.length) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account has no role assigned. Please contact support.",
		);
	}

	const refresh = await issueRefreshToken(authUser.id, context);

	return {
		user: authUser,
		tokens: {
			accessToken: issueAccessToken(authUser.id, authUser.roles),
			refreshToken: refresh.token,
		},
	};
};

/**
 * Rotating refresh: the presented token is revoked and replaced atomically.
 *
 * Reuse detection - if a token that was ALREADY rotated out is presented again,
 * it has almost certainly been stolen (the legitimate client would be holding
 * its replacement). Every live token for that user is revoked, forcing a fresh
 * login on all devices.
 */
const refreshTokens = async (
	rawToken: string | undefined,
	context: IRequestContext,
): Promise<{ user: IAuthUser; tokens: IAuthTokens }> => {
	if (!rawToken) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Refresh token is missing. Please log in again.",
		);
	}

	const verified = jwtUtils.verifyToken(rawToken, config.jwt_refresh_secret);

	if (!verified.success) {
		throw new AppError(httpStatus.UNAUTHORIZED, verified.error);
	}

	if (verified.data.type !== "refresh") {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid authentication token.",
		);
	}

	const stored = await prisma.refreshToken.findUnique({
		where: { tokenHash: hashToken(rawToken) },
		select: {
			id: true,
			userId: true,
			expiresAt: true,
			revokedAt: true,
		},
	});

	if (!stored) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid refresh token. Please log in again.",
		);
	}

	if (stored.revokedAt) {
		// Replay of a rotated/revoked token -> treat the whole session chain as
		// compromised.
		await prisma.refreshToken.updateMany({
			where: { userId: stored.userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});

		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"This session is no longer valid. Please log in again.",
		);
	}

	if (stored.expiresAt.getTime() <= Date.now()) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Your session has expired. Please log in again.",
		);
	}

	// The user must still be active: a soft-deleted account cannot refresh.
	const user = await prisma.user.findFirst({
		where: { id: stored.userId, deletedAt: null },
		select: userSelect,
	});

	if (!user) {
		await prisma.refreshToken.updateMany({
			where: { userId: stored.userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});

		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid refresh token. Please log in again.",
		);
	}

	const authUser = toAuthUser(user);

	const rotated = await prisma.$transaction(async (tx) => {
		const issued = await issueRefreshToken(authUser.id, context, tx);

		// Conditional update: if a concurrent request rotated this same token
		// first, `count` is 0 and we abort rather than mint two live tokens.
		const { count } = await tx.refreshToken.updateMany({
			where: { id: stored.id, revokedAt: null },
			data: { revokedAt: new Date(), replacedByTokenId: issued.id },
		});

		if (count === 0) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"This session is no longer valid. Please log in again.",
			);
		}

		return issued;
	});

	return {
		user: authUser,
		tokens: {
			accessToken: issueAccessToken(authUser.id, authUser.roles),
			refreshToken: rotated.token,
		},
	};
};

/**
 * Revokes the presented refresh token. Idempotent: logging out twice, or with a
 * token the server has never seen, still succeeds - there is nothing useful to
 * tell the caller, and reporting "unknown token" would leak information.
 */
const logout = async (rawToken: string | undefined): Promise<void> => {
	if (!rawToken) return;

	await prisma.refreshToken.updateMany({
		where: { tokenHash: hashToken(rawToken), revokedAt: null },
		data: { revokedAt: new Date() },
	});
};

const getMe = async (userId: string): Promise<IAuthUser> => {
	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: userSelect,
	});

	if (!user) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User not found. Please log in again.",
		);
	}

	return toAuthUser(user);
};

export const AuthService = {
	register,
	login,
	refreshTokens,
	logout,
	getMe,
};
