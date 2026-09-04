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
	| { success: false; error: string };

const verifyToken = (token: string, secret: string): TVerifyResult => {
	try {
		return { success: true, data: jwt.verify(token, secret) as JwtPayload };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Invalid token",
		};
	}
};

export const jwtUtils = { generateToken, verifyToken };
