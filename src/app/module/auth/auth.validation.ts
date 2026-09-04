import { z } from "zod";
import { AppRole } from "../../constants/roles";

/**
 * Email normalization: trim + lowercase, applied here so registration, login
 * and the uniqueness check all agree. "John@Example.com" and
 * "john@example.com " become the same stored value.
 */
const emailSchema = z
	.string({ error: "Email is required" })
	.trim()
	.toLowerCase()
	.email({ message: "Please provide a valid email address" })
	.max(255, { message: "Email must be at most 255 characters" });

/**
 * Deliberately modest: 8+ chars with an upper, a lower and a digit. Longer or
 * more exotic rules push users toward predictable substitutions and password
 * reuse without adding real strength.
 */
const passwordSchema = z
	.string({ error: "Password is required" })
	.min(8, { message: "Password must be at least 8 characters long" })
	.max(72, {
		// bcrypt silently ignores anything past 72 bytes; rejecting is honest.
		message: "Password must be at most 72 characters",
	})
	.regex(/[a-z]/, {
		message: "Password must contain at least one lowercase letter",
	})
	.regex(/[A-Z]/, {
		message: "Password must contain at least one uppercase letter",
	})
	.regex(/[0-9]/, { message: "Password must contain at least one number" });

/**
 * ADMIN is absent by design: it is not self-assignable. Admin accounts are
 * created through the controlled seeder (ADMIN_* env vars).
 */
const registerRoleSchema = z.enum([AppRole.OWNER, AppRole.TENANT], {
	error: "Role must be either OWNER or TENANT",
});

export const RegisterZodSchema = z.object({
	name: z
		.string({ error: "Name is required" })
		.trim()
		.min(2, { message: "Name must be at least 2 characters long" })
		.max(100, { message: "Name must be at most 100 characters" }),
	email: emailSchema,
	password: passwordSchema,
	phone: z
		.string()
		.trim()
		.min(6, { message: "Phone must be at least 6 characters" })
		.max(20, { message: "Phone must be at most 20 characters" })
		.optional(),
	role: registerRoleSchema,
});

export const LoginZodSchema = z.object({
	email: emailSchema,
	// Login only checks presence: applying the registration policy here would
	// tell an attacker which passwords could not possibly be valid.
	password: z.string({ error: "Password is required" }).min(1, {
		message: "Password is required",
	}),
});

/**
 * The refresh token normally arrives as an HttpOnly cookie. The optional body
 * field exists for non-browser clients; the controller prefers the cookie.
 */
export const RefreshTokenZodSchema = z.object({
	refreshToken: z.string().trim().min(1).optional(),
});

export const AuthValidation = {
	RegisterZodSchema,
	LoginZodSchema,
	RefreshTokenZodSchema,
};
