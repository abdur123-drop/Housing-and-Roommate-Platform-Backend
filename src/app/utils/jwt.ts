import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const generateToken = (
	payload: JwtPayload,
	secret: string,
	expiresIn: string,
) => {
	return jwt.sign(payload, secret, {
		expiresIn,
	} as SignOptions);
};

type TVerifyResult =
	| { success: true; data: JwtPayload }
	| { success: false; error: string; expired: boolean };

/**
 * Verifies a token without throwing.
 *
 * `expired` is reported separately from other failures so callers can tell a
 * client "your session ended, refresh" instead of the alarming "invalid token",
 * while still refusing to say *why* a token was otherwise rejected.
 */
const verifyToken = (token: string, secret: string): TVerifyResult => {
	try {
		return { success: true, data: jwt.verify(token, secret) as JwtPayload };
	} catch (error) {
		const expired = error instanceof jwt.TokenExpiredError;
		return {
			success: false,
			expired,
			error: expired
				? "Your session has expired. Please log in again."
				: "Invalid authentication token.",
		};
	}
};

/**
 * Absolute expiry of an already-signed token, as a Date.
 *
 * Used to persist a refresh token's `expires_at` without re-parsing duration
 * strings like "30d" - the JWT's own `exp` claim is the authoritative value.
 */
const getExpiryDate = (token: string): Date => {
	const decoded = jwt.decode(token) as JwtPayload | null;

	if (!decoded?.exp) {
		throw new Error("Signed token is missing an exp claim");
	}

	return new Date(decoded.exp * 1000);
};

export const jwtUtils = { generateToken, verifyToken, getExpiryDate };
