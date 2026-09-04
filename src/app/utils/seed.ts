import { APP_ROLES, AppRole } from "../constants/roles";
import config from "../config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "./password";

/**
 * Seeds the five platform roles. Idempotent - safe to run on every boot.
 */
export const seedRoles = async () => {
	for (const name of APP_ROLES) {
		await prisma.role.upsert({
			where: { name },
			update: {},
			create: { name },
		});
	}

	console.log(`Roles seeded: ${APP_ROLES.join(", ")}`);
};

/**
 * Seeds the platform ADMIN from env vars. Skipped entirely when
 * ADMIN_EMAIL / ADMIN_PASSWORD are not configured.
 */
export const seedAdmin = async () => {
	const name = config.admin_name;
	// Normalized exactly as registration/login normalize it, so the seeded admin
	// can actually log in with the address as typed.
	const email = config.admin_email?.trim().toLowerCase();
	const password = config.admin_password;

	if (!name || !email || !password) {
		console.log("Admin env vars not set - skipping admin seed.");
		return;
	}

	// findFirst, not findUnique: users.email is unique only among rows where
	// deleted_at IS NULL (partial index `users_email_active_key`).
	const existing = await prisma.user.findFirst({
		where: { email, deletedAt: null },
	});

	if (existing) {
		console.log("Admin Already Exists!");
		return;
	}

	const adminRole = await prisma.role.findUniqueOrThrow({
		where: { name: AppRole.ADMIN },
	});

	const hashedPassword = await hashPassword(password);

	const admin = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			userRoles: {
				create: { roleId: adminRole.id },
			},
		},
		select: { id: true, name: true, email: true },
	});

	console.log("Admin Created : ", admin);
};
