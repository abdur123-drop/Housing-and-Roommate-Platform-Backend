import { z } from "zod";
import { RoomStatus, RoomType } from "../../../generated/prisma/enums";

const decimalString = (field: string) =>
	z
		.union([z.string().trim(), z.number()])
		.transform((value) => String(value))
		.refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
			message: `${field} must be a valid non-negative amount`,
		});

const forbiddenUpdateFields = z.object({
	id: z.never({ error: "id cannot be updated here" }).optional(),
	unitId: z.never({ error: "unitId cannot be updated here" }).optional(),
	unit_id: z.never({ error: "unit_id cannot be updated here" }).optional(),
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

const roomTypeSchema = z.enum(Object.values(RoomType), {
	error: "Invalid room type",
});
const roomStatusSchema = z.enum(Object.values(RoomStatus), {
	error: "Invalid room status",
});

export const CreateRoomZodSchema = z
	.object({
		roomNumber: z
			.string({ error: "Room number is required" })
			.trim()
			.min(1, { message: "Room number is required" })
			.max(50),
		name: z.string().trim().min(1).max(120).optional(),
		roomType: roomTypeSchema,
		monthlyRent: decimalString("Monthly rent"),
		securityDeposit: decimalString("Security deposit").optional(),
		status: roomStatusSchema.optional(),
	})
	.strict();

export const UpdateRoomZodSchema = CreateRoomZodSchema.partial()
	.and(forbiddenUpdateFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one room field must be provided",
	});

export const RoomParamZodSchema = z
	.object({
		id: z.uuid({ error: "Room id must be a valid UUID" }),
	})
	.strict();

export const UnitRoomParamZodSchema = z
	.object({
		unitId: z.uuid({ error: "Unit id must be a valid UUID" }),
	})
	.strict();

export const RoomQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		search: z.string().trim().min(1).max(100).optional(),
		status: roomStatusSchema.optional(),
		roomType: roomTypeSchema.optional(),
		sortBy: z
			.enum([
				"roomNumber",
				"name",
				"roomType",
				"monthlyRent",
				"status",
				"createdAt",
				"updatedAt",
			])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export const RoomValidation = {
	CreateRoomZodSchema,
	UpdateRoomZodSchema,
	RoomParamZodSchema,
	UnitRoomParamZodSchema,
	RoomQueryZodSchema,
};
