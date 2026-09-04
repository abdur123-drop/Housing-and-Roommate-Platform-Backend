import type { TAppRole } from "../../constants/roles";

export interface IRegisterPayload {
	name: string;
	email: string;
	password: string;
	phone?: string;
	role: Extract<TAppRole, "OWNER" | "TENANT">;
}

export interface ILoginPayload {
	email: string;
	password: string;
}

/** Safe projection of a user - never carries the password hash. */
export interface IAuthUser {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	avatar: string | null;
	roles: TAppRole[];
	createdAt: Date;
}

/**
 * The refresh token is intentionally separate from the client-facing payload:
 * it is delivered as an HttpOnly cookie, never in the JSON body.
 */
export interface IAuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface IAuthResult {
	user: IAuthUser;
	tokens: IAuthTokens;
}

export interface IRequestContext {
	ip?: string;
	userAgent?: string;
}
