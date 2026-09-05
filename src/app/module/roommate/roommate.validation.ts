import { z } from "zod";

const text = (field: string, max = 255) =>
	z
		.string({ error: `${field} is required` })
		.trim()
		.min(1, { message: `${field} cannot be empty` })
		.max(max, { message: `${field} must be at most ${max} characters` });

const optionalText = (field: string, max = 255) => text(field, max).optional();

const decimalString = (field: string) =>
	z
		.union([z.string().trim(), z.number()])
		.transform((value) => String(value))
		.refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
			message: `${field} must be a positive decimal with up to 2 decimals`,
		})
		.refine((value) => Number(value) >= 0, {
			message: `${field} must be greater than or equal to 0`,
		});

const optionalDecimalString = (field: string) =>
	decimalString(field).optional();

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value));

const optionalIsoDate = (field: string) => isoDate(field).optional();

const queryBoolean = (field: string) =>
	z
		.preprocess(
			(value) => {
				if (value === "true") return true;
				if (value === "false") return false;
				return value;
			},
			z.boolean({ error: `${field} must be true or false` }),
		)
		.optional();

const pageSchema = z.coerce
	.number()
	.int()
	.min(1, { message: "page must be greater than or equal to 1" })
	.default(1);

const limitSchema = z.coerce
	.number()
	.int()
	.min(1, { message: "limit must be greater than or equal to 1" })
	.max(100, { message: "limit must be less than or equal to 100" })
	.default(10);

const forbiddenProfileFields = z.object({
	id: z.never({ error: "id cannot be updated here" }).optional(),
	userId: z.never({ error: "userId cannot be updated here" }).optional(),
	user_id: z.never({ error: "user_id cannot be updated here" }).optional(),
	tenantId: z.never({ error: "tenantId cannot be updated here" }).optional(),
	tenant_id: z.never({ error: "tenant_id cannot be updated here" }).optional(),
	ownerId: z.never({ error: "ownerId cannot be updated here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be updated here" }).optional(),
	created_at: z
		.never({ error: "created_at cannot be updated here" })
		.optional(),
	updatedAt: z.never({ error: "updatedAt cannot be updated here" }).optional(),
	updated_at: z
		.never({ error: "updated_at cannot be updated here" })
		.optional(),
	deletedAt: z.never({ error: "deletedAt cannot be updated here" }).optional(),
	deleted_at: z
		.never({ error: "deleted_at cannot be updated here" })
		.optional(),
});

const profileShape = {
	bio: optionalText("Bio", 2000),
	occupation: optionalText("Occupation", 120),
	budgetMin: optionalDecimalString("budgetMin"),
	budgetMax: optionalDecimalString("budgetMax"),
	preferredLocation: optionalText("Preferred location", 255),
	moveInDate: optionalIsoDate("moveInDate"),
	smoking: z.boolean().optional(),
	pets: z.boolean().optional(),
	genderPreference: optionalText("Gender preference", 80),
	isDiscoverable: z.boolean().optional(),
};

const validBudgetRange = (payload: {
	budgetMin?: string;
	budgetMax?: string;
}) =>
	!payload.budgetMin ||
	!payload.budgetMax ||
	Number(payload.budgetMin) <= Number(payload.budgetMax);

export const CreateRoommateProfileZodSchema = z
	.object(profileShape)
	.strict()
	.and(forbiddenProfileFields)
	.refine(validBudgetRange, {
		message: "budgetMin must be less than or equal to budgetMax",
		path: ["budgetMax"],
	});

export const UpdateRoommateProfileZodSchema = z
	.object(profileShape)
	.strict()
	.and(forbiddenProfileFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one profile field must be provided",
	})
	.refine(validBudgetRange, {
		message: "budgetMin must be less than or equal to budgetMax",
		path: ["budgetMax"],
	});

const preferenceValueSchema = z
	.string()
	.trim()
	.min(1, { message: "Preference value cannot be empty" })
	.max(120, { message: "Preference value must be at most 120 characters" })
	.optional();

export const UpsertMyPreferencesZodSchema = z
	.object({
		preferences: z
			.array(
				z
					.object({
						preferenceId: z.uuid({
							error: "preferenceId must be a valid UUID",
						}),
						value: preferenceValueSchema,
					})
					.strict(),
			)
			.max(50, { message: "At most 50 preferences may be set" }),
	})
	.strict()
	.refine(
		(payload) =>
			new Set(payload.preferences.map((item) => item.preferenceId)).size ===
			payload.preferences.length,
		{ message: "Duplicate preferenceId values are not allowed" },
	);

export const CreatePreferenceZodSchema = z
	.object({
		name: text("Name", 120),
		type: optionalText("Type", 80),
	})
	.strict();

export const UpdatePreferenceZodSchema = CreatePreferenceZodSchema.partial()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one preference field must be provided",
	})
	.and(
		z.object({
			id: z.never({ error: "id cannot be updated here" }).optional(),
			deletedAt: z
				.never({ error: "deletedAt cannot be updated here" })
				.optional(),
			deleted_at: z
				.never({ error: "deleted_at cannot be updated here" })
				.optional(),
		}),
	);

export const RoommateIdParamZodSchema = z
	.object({
		id: z.uuid({ error: "Roommate profile id must be a valid UUID" }),
	})
	.strict();

export const PreferenceIdParamZodSchema = z
	.object({
		id: z.uuid({ error: "Preference id must be a valid UUID" }),
	})
	.strict();

const roommateQueryShape = {
	page: pageSchema,
	limit: limitSchema,
	search: z.string().trim().min(1).max(100).optional(),
	location: z.string().trim().min(1).max(255).optional(),
	budgetMin: optionalDecimalString("budgetMin"),
	budgetMax: optionalDecimalString("budgetMax"),
	moveInFrom: optionalIsoDate("moveInFrom"),
	moveInTo: optionalIsoDate("moveInTo"),
	smoking: queryBoolean("smoking"),
	pets: queryBoolean("pets"),
	genderPreference: z.string().trim().min(1).max(80).optional(),
};

const validMoveInRange = (query: { moveInFrom?: Date; moveInTo?: Date }) =>
	!query.moveInFrom || !query.moveInTo || query.moveInFrom <= query.moveInTo;

export const RoommateQueryZodSchema = z
	.object({
		...roommateQueryShape,
		sortBy: z
			.enum(
				["createdAt", "updatedAt", "budgetMin", "budgetMax", "moveInDate"],
				{
					error: "Invalid sort field",
				},
			)
			.default("createdAt"),
		sortOrder: z
			.enum(["asc", "desc"], { error: "Invalid sort order" })
			.default("desc"),
	})
	.strict()
	.refine(validBudgetRange, {
		message: "budgetMin must be less than or equal to budgetMax",
		path: ["budgetMax"],
	})
	.refine(validMoveInRange, {
		message: "moveInFrom must be before or equal to moveInTo",
		path: ["moveInTo"],
	});

export const RoommateMatchQueryZodSchema = z
	.object(roommateQueryShape)
	.strict()
	.refine(validBudgetRange, {
		message: "budgetMin must be less than or equal to budgetMax",
		path: ["budgetMax"],
	})
	.refine(validMoveInRange, {
		message: "moveInFrom must be before or equal to moveInTo",
		path: ["moveInTo"],
	});

export const RoommateValidation = {
	CreateRoommateProfileZodSchema,
	UpdateRoommateProfileZodSchema,
	UpsertMyPreferencesZodSchema,
	CreatePreferenceZodSchema,
	UpdatePreferenceZodSchema,
	RoommateIdParamZodSchema,
	PreferenceIdParamZodSchema,
	RoommateQueryZodSchema,
	RoommateMatchQueryZodSchema,
};
