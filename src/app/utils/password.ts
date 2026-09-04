import bcrypt from "bcryptjs";
import config from "../config";

const DEFAULT_SALT_ROUNDS = 12;

const saltRounds = (): number => {
	const configured = Number(config.bcrypt_salt_rounds);
	return Number.isFinite(configured) && configured > 0
		? configured
		: DEFAULT_SALT_ROUNDS;
};

export const hashPassword = (plain: string): Promise<string> =>
	bcrypt.hash(plain, saltRounds());

export const comparePassword = (
	plain: string,
	hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);

/**
 * A bcrypt hash of a fixed dummy value, compared against when login is given an
 * unknown email.
 *
 * Without it, "no such user" returns far faster than "wrong password", and that
 * timing difference alone lets an attacker enumerate which emails are
 * registered - defeating the generic "Invalid email or password" message.
 */
export const DUMMY_PASSWORD_HASH =
	"$2b$12$C6UzMDM.H6dfI/f/IKcEe.4nQeMFY0BLKZKvW6Vv0DKPZWZ4kR3Fu";

export const wastePasswordCompareTime = async (): Promise<void> => {
	await bcrypt.compare("dummy-password-for-timing", DUMMY_PASSWORD_HASH);
};
