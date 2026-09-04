/**
 * The platform has exactly three primary RBAC roles.
 *
 * Deliberately NOT roles:
 *  - ROOMMATE          -> a TENANT that also has a `roommate_profiles` row.
 *  - PROPERTY_MANAGER  -> the user assigned in `properties.manager_id` for one
 *                         specific property. Authorization for that link is
 *                         resource-level, not role-level.
 *
 * Roles live in the `roles` table (not a Prisma enum) and are joined through
 * `user_roles`, so a user can hold more than one. This list is the single
 * source of truth for seeding, and is mirrored by the `roles_name_allowed`
 * CHECK constraint in the database.
 */
export const AppRole = {
	OWNER: "OWNER",
	TENANT: "TENANT",
	ADMIN: "ADMIN",
} as const;

export type TAppRole = (typeof AppRole)[keyof typeof AppRole];

export const APP_ROLES: TAppRole[] = Object.values(AppRole);
