import { z } from "zod";
import { UnitStatus } from "../../../generated/prisma/enums";

const forbiddenUpdateFields = z.object({
	id: z.never({ error: "id cannot be updated here" }).optional(),
	buildingId: z
		.never({ error: "buildingId cannot be updated here" })
		.optional(),
	building_id: z
		.never({ error: "building_id cannot be updated here" })
		.optional(),
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

const unitNumber = z
	.string({ error: "Unit number is required" })
	.trim()
	.min(1, { message: "Unit number is required" })
	.max(50, { message: "Unit number must be at most 50 characters" });

const nonNegativeInt = (field: string) =>
	z.coerce
		.number()
		.int({ message: `${field} must be an integer` })
		.min(0, { message: `${field} cannot be negative` });

const unitStatusSchema = z.enum(Object.values(UnitStatus), {
	error: "Invalid unit status",
});

export const CreateUnitZodSchema = z
	.object({
		unitNumber,
		floor: z.coerce.number().int().optional(),
		bedrooms: nonNegativeInt("Bedrooms").optional(),
		bathrooms: nonNegativeInt("Bathrooms").optional(),
		status: unitStatusSchema.optional(),
	})
	.strict();

export const UpdateUnitZodSchema = CreateUnitZodSchema.partial()
	.and(forbiddenUpdateFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one unit field must be provided",
	});

export const UnitParamZodSchema = z
	.object({
		id: z.uuid({ error: "Unit id must be a valid UUID" }),
	})
	.strict();

export const BuildingUnitParamZodSchema = z
	.object({
		buildingId: z.uuid({ error: "Building id must be a valid UUID" }),
	})
	.strict();

export const UnitQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		search: z.string().trim().min(1).max(100).optional(),
		status: unitStatusSchema.optional(),
		sortBy: z
			.enum([
				"unitNumber",
				"floor",
				"bedrooms",
				"bathrooms",
				"status",
				"createdAt",
				"updatedAt",
			])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export const UnitValidation = {
	CreateUnitZodSchema,
	UpdateUnitZodSchema,
	UnitParamZodSchema,
	BuildingUnitParamZodSchema,
	UnitQueryZodSchema,
};
