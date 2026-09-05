import { z } from "zod";
import { AvailabilityStatus } from "../../../generated/prisma/enums";

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value));

const optionalIsoDate = (field: string) =>
	z
		.string()
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value))
		.optional();

const availabilityStatusSchema = z.enum(Object.values(AvailabilityStatus), {
	error: "Invalid availability status",
});

const validRange = <T extends { availableFrom?: Date; availableTo?: Date }>(
	payload: T,
) => {
	if (!payload.availableFrom || !payload.availableTo) return true;
	if (
		!(payload.availableFrom instanceof Date) ||
		!(payload.availableTo instanceof Date)
	) {
		return true;
	}

	return payload.availableFrom.getTime() < payload.availableTo.getTime();
};

const forbiddenUpdateFields = z.object({
	id: z.never({ error: "id cannot be updated here" }).optional(),
	roomId: z.never({ error: "roomId cannot be updated here" }).optional(),
	room_id: z.never({ error: "room_id cannot be updated here" }).optional(),
	ownerId: z.never({ error: "ownerId cannot be updated here" }).optional(),
	propertyId: z
		.never({ error: "propertyId cannot be updated here" })
		.optional(),
	buildingId: z
		.never({ error: "buildingId cannot be updated here" })
		.optional(),
	unitId: z.never({ error: "unitId cannot be updated here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be updated here" }).optional(),
	created_at: z
		.never({ error: "created_at cannot be updated here" })
		.optional(),
	deletedAt: z.never({ error: "deletedAt cannot be updated here" }).optional(),
	deleted_at: z
		.never({ error: "deleted_at cannot be updated here" })
		.optional(),
});

export const CreateRoomAvailabilityZodSchema = z
	.object({
		availableFrom: isoDate("availableFrom"),
		availableTo: isoDate("availableTo"),
		status: availabilityStatusSchema.optional(),
	})
	.strict()
	.refine(validRange, {
		message: "availableFrom must be before availableTo",
		path: ["availableTo"],
	});

export const UpdateRoomAvailabilityZodSchema = z
	.object({
		availableFrom: optionalIsoDate("availableFrom"),
		availableTo: optionalIsoDate("availableTo"),
		status: availabilityStatusSchema.optional(),
	})
	.strict()
	.and(forbiddenUpdateFields)
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one availability field must be provided",
	})
	.refine(validRange, {
		message: "availableFrom must be before availableTo",
		path: ["availableTo"],
	});

export const RoomAvailabilityParamZodSchema = z
	.object({
		id: z.uuid({ error: "Room availability id must be a valid UUID" }),
	})
	.strict();

export const RoomAvailabilityRoomParamZodSchema = z
	.object({
		roomId: z.uuid({ error: "Room id must be a valid UUID" }),
	})
	.strict();

export const RoomAvailabilityQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		status: availabilityStatusSchema.optional(),
		from: optionalIsoDate("from"),
		to: optionalIsoDate("to"),
		sortBy: z
			.enum(["availableFrom", "availableTo", "createdAt", "updatedAt"])
			.default("availableFrom"),
		sortOrder: z.enum(["asc", "desc"]).default("asc"),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: "from must be before to",
		path: ["to"],
	});

export const RoomAvailabilityValidation = {
	CreateRoomAvailabilityZodSchema,
	UpdateRoomAvailabilityZodSchema,
	RoomAvailabilityParamZodSchema,
	RoomAvailabilityRoomParamZodSchema,
	RoomAvailabilityQueryZodSchema,
};
