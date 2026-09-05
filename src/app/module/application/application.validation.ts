import { z } from "zod";
import { ApplicationStatus } from "../../../generated/prisma/enums";

const messageSchema = z
	.string()
	.trim()
	.min(1, { message: "Message cannot be empty" })
	.max(2000, { message: "Message must be at most 2000 characters" })
	.optional();

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value));

const optionalIsoDate = (field: string) => isoDate(field).optional();

const statusSchema = z.enum(Object.values(ApplicationStatus), {
	error: "Invalid application status",
});

const transitionStatusSchema = z.enum(
	[
		ApplicationStatus.APPROVED,
		ApplicationStatus.REJECTED,
		ApplicationStatus.WITHDRAWN,
	],
	{ error: "Invalid application transition status" },
);

const forbiddenClientFields = z.object({
	id: z.never({ error: "id cannot be set here" }).optional(),
	userId: z.never({ error: "userId cannot be set here" }).optional(),
	user_id: z.never({ error: "user_id cannot be set here" }).optional(),
	tenantId: z.never({ error: "tenantId cannot be set here" }).optional(),
	tenant_id: z.never({ error: "tenant_id cannot be set here" }).optional(),
	propertyId: z.never({ error: "propertyId cannot be set here" }).optional(),
	property_id: z.never({ error: "property_id cannot be set here" }).optional(),
	ownerId: z.never({ error: "ownerId cannot be set here" }).optional(),
	managerId: z.never({ error: "managerId cannot be set here" }).optional(),
	status: z.never({ error: "status cannot be set here" }).optional(),
	deletedAt: z.never({ error: "deletedAt cannot be set here" }).optional(),
	deleted_at: z.never({ error: "deleted_at cannot be set here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be set here" }).optional(),
	created_at: z.never({ error: "created_at cannot be set here" }).optional(),
	submittedAt: z.never({ error: "submittedAt cannot be set here" }).optional(),
	submitted_at: z
		.never({ error: "submitted_at cannot be set here" })
		.optional(),
	updatedAt: z.never({ error: "updatedAt cannot be set here" }).optional(),
	updated_at: z.never({ error: "updated_at cannot be set here" }).optional(),
});

export const CreateApplicationZodSchema = z
	.object({
		roomId: z.uuid({ error: "roomId must be a valid UUID" }),
		viewingRequestId: z
			.uuid({ error: "viewingRequestId must be a valid UUID" })
			.optional(),
		message: messageSchema,
	})
	.strict()
	.and(forbiddenClientFields);

export const ApplicationParamZodSchema = z
	.object({
		id: z.uuid({ error: "Application id must be a valid UUID" }),
	})
	.strict();

export const ApplicationPropertyParamZodSchema = z
	.object({
		propertyId: z.uuid({ error: "Property id must be a valid UUID" }),
	})
	.strict();

export const ApplicationActionZodSchema = z
	.object({
		status: transitionStatusSchema.optional(),
		message: messageSchema,
	})
	.strict()
	.and(forbiddenClientFields);

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

export const ApplicationQueryZodSchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		status: statusSchema.optional(),
		propertyId: z.uuid({ error: "propertyId must be a valid UUID" }).optional(),
		roomId: z.uuid({ error: "roomId must be a valid UUID" }).optional(),
		from: optionalIsoDate("from"),
		to: optionalIsoDate("to"),
		sortBy: z
			.enum(["submittedAt", "updatedAt", "status"], {
				error: "Invalid sort field",
			})
			.default("submittedAt"),
		sortOrder: z
			.enum(["asc", "desc"], { error: "Invalid sort order" })
			.default("desc"),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: "from must be before to",
		path: ["to"],
	});

export const ApplicationValidation = {
	CreateApplicationZodSchema,
	ApplicationParamZodSchema,
	ApplicationPropertyParamZodSchema,
	ApplicationActionZodSchema,
	ApplicationQueryZodSchema,
};
