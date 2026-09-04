import { z } from "zod";

const text = (field: string, max = 255) =>
	z
		.string({ error: `${field} is required` })
		.trim()
		.min(1, { message: `${field} is required` })
		.max(max, { message: `${field} must be at most ${max} characters` });

const optionalText = (field: string, max = 1000) =>
	z
		.string()
		.trim()
		.min(1, { message: `${field} cannot be empty` })
		.max(max, { message: `${field} must be at most ${max} characters` })
		.optional();

const forbiddenUpdateFields = z.object({
	id: z.never({ error: "id cannot be updated here" }).optional(),
	propertyId: z
		.never({ error: "propertyId cannot be updated here" })
		.optional(),
	property_id: z
		.never({ error: "property_id cannot be updated here" })
		.optional(),
	deletedAt: z.never({ error: "deletedAt cannot be updated here" }).optional(),
	deleted_at: z
		.never({ error: "deleted_at cannot be updated here" })
		.optional(),
});

export const CreateBuildingZodSchema = z
	.object({
		name: text("Building name"),
		description: optionalText("Description"),
	})
	.strict();

export const UpdateBuildingZodSchema = CreateBuildingZodSchema.partial()
	.and(forbiddenUpdateFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one building field must be provided",
	});

export const BuildingParamZodSchema = z
	.object({
		id: z.uuid({ error: "Building id must be a valid UUID" }),
	})
	.strict();

export const PropertyBuildingParamZodSchema = z
	.object({
		propertyId: z.uuid({ error: "Property id must be a valid UUID" }),
	})
	.strict();

export const BuildingQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		search: z.string().trim().min(1).max(100).optional(),
		sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export const BuildingValidation = {
	CreateBuildingZodSchema,
	UpdateBuildingZodSchema,
	BuildingParamZodSchema,
	PropertyBuildingParamZodSchema,
	BuildingQueryZodSchema,
};
