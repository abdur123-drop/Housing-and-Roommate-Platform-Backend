/**
 * Roles live in the `roles` table (not a Prisma enum) because a user can hold
 * several of them at once through `user_roles`. These constants are the single
 * source of truth for the seeded role names.
 */
export const AppRole = {
	OWNER: "OWNER",
	TENANT: "TENANT",
	ROOMMATE: "ROOMMATE",
	PROPERTY_MANAGER: "PROPERTY_MANAGER",
	ADMIN: "ADMIN",
} as const;

export type TAppRole = (typeof AppRole)[keyof typeof AppRole];

export const APP_ROLES: TAppRole[] = Object.values(AppRole);
