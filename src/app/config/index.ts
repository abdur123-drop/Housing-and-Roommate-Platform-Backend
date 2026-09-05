import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const node_env = process.env.NODE_ENV ?? "development";
const isProduction = node_env === "production";

const config = {
	node_env,
	isProduction,
	port: process.env.PORT,
	database_url: process.env.DATABASE_URL,
	backend_url: process.env.APP_URL,
	frontend_url: process.env.FRONTEND_URL,
	bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
	jwt_access_secret: process.env.JWT_ACCESS_SECRET as string,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET as string,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
	admin_name: process.env.ADMIN_NAME,
	admin_email: process.env.ADMIN_EMAIL,
	admin_password: process.env.ADMIN_PASSWORD,
	stripe_secret_key: process.env.STRIPE_SECRET_KEY,
	stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
	redis_url: process.env.REDIS_URL,
};

/** Minimum entropy we accept for a signing secret: 32 chars (~128 bits hex). */
const MIN_SECRET_LENGTH = 32;

/**
 * Fails fast when authentication configuration is missing or weak.
 *
 * Without this the app would boot happily and then reject every login with a
 * confusing 401, because `jwt.verify(token, "")` throws. Called from server.ts
 * before anything else.
 *
 * Never logs a secret value - only the name of the offending variable.
 */
export const validateAuthConfig = (): void => {
	if (node_env === "test") return;

	const problems: string[] = [];

	const checkSecret = (name: string, value: string | undefined) => {
		if (!value) {
			problems.push(`${name} is missing`);
		} else if (value.length < MIN_SECRET_LENGTH) {
			problems.push(
				`${name} is too short (${value.length} chars, need >= ${MIN_SECRET_LENGTH})`,
			);
		}
	};

	checkSecret("JWT_ACCESS_SECRET", config.jwt_access_secret);
	checkSecret("JWT_REFRESH_SECRET", config.jwt_refresh_secret);

	if (
		config.jwt_access_secret &&
		config.jwt_access_secret === config.jwt_refresh_secret
	) {
		problems.push(
			"JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets",
		);
	}

	if (!config.database_url) problems.push("DATABASE_URL is missing");

	if (problems.length) {
		throw new Error(
			`Invalid authentication configuration:\n  - ${problems.join("\n  - ")}\n` +
				`Generate a secret with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
		);
	}
};

export default config;
