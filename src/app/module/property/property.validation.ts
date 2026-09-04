import { z } from "zod";
import { PropertyStatus, PropertyType } from "../../../generated/prisma/enums";

const nonEmptyText = (field: string, max = 255) =>
	z
		.string({ error: `${field} is required` })
		.trim()
		.min(1, { message: `${field} is required` })
		.max(max, { message: `${field} must be at most ${max} characters` });

const optionalText = (field: string, max = 255) =>
	z
		.string()
		.trim()
		.min(1, { message: `${field} cannot be empty` })
		.max(max, { message: `${field} must be at most ${max} characters` })
		.optional();

const decimalString = (field: string) =>
	z
		.union([z.string().trim(), z.number()])
		.transform((value) => String(value))
		.refine((value) => /^-?\d+(\.\d+)?$/.test(value), {
			message: `${field} must be a valid decimal number`,
		})
		.optional();

const propertyTypeSchema = z.enum(Object.values(PropertyType), {
	error: "Invalid property type",
});

const propertyStatusSchema = z.enum(Object.values(PropertyStatus), {
	error: "Invalid property status",
});

const forbiddenPropertyFields = z
	.object({
		ownerId: z.never({ error: "ownerId cannot be updated here" }).optional(),
		owner_id: z.never({ error: "owner_id cannot be updated here" }).optional(),
		managerId: z
			.never({ error: "managerId cannot be updated here" })
			.optional(),
		manager_id: z
			.never({ error: "manager_id cannot be updated here" })
			.optional(),
		deletedAt: z
			.never({ error: "deletedAt cannot be updated here" })
			.optional(),
		deleted_at: z
			.never({ error: "deleted_at cannot be updated here" })
			.optional(),
	})
	.partial();

export const CreatePropertyZodSchema = z
	.object({
		title: nonEmptyText("Title"),
		description: optionalText("Description", 2000),
		propertyType: propertyTypeSchema,
		address: nonEmptyText("Address", 500),
		city: nonEmptyText("City", 120),
		state: optionalText("State", 120),
		country: nonEmptyText("Country", 120),
		zipCode: optionalText("Zip code", 30),
		latitude: decimalString("Latitude").refine(
			(value) =>
				value === undefined || (Number(value) >= -90 && Number(value) <= 90),
			{ message: "Latitude must be between -90 and 90" },
		),
		longitude: decimalString("Longitude").refine(
			(value) =>
				value === undefined || (Number(value) >= -180 && Number(value) <= 180),
			{ message: "Longitude must be between -180 and 180" },
		),
		status: propertyStatusSchema.optional(),
	})
	.strict();

export const UpdatePropertyZodSchema = CreatePropertyZodSchema.partial()
	.and(forbiddenPropertyFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one property field must be provided",
	});

export const AssignManagerZodSchema = z
	.object({
		managerId: z.uuid({ error: "managerId must be a valid UUID" }).nullable(),
	})
	.strict();

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

export const PropertyQueryZodSchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		search: z.string().trim().min(1).max(100).optional(),
		status: propertyStatusSchema.optional(),
		propertyType: propertyTypeSchema.optional(),
		city: z.string().trim().min(1).max(120).optional(),
		country: z.string().trim().min(1).max(120).optional(),
		sortBy: z
			.enum(["createdAt", "updatedAt", "title", "city", "status"], {
				error: "Invalid sort field",
			})
			.default("createdAt"),
		sortOrder: z
			.enum(["asc", "desc"], { error: "Invalid sort order" })
			.default("desc"),
	})
	.strict();

export const PropertyIdParamZodSchema = z
	.object({
		id: z.uuid({ error: "Property id must be a valid UUID" }),
	})
	.strict();

export const PropertyValidation = {
	CreatePropertyZodSchema,
	UpdatePropertyZodSchema,
	AssignManagerZodSchema,
	PropertyQueryZodSchema,
	PropertyIdParamZodSchema,
};
