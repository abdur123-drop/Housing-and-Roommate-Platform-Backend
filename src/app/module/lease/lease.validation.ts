import { z } from "zod";
import { LeaseStatus } from "../../../generated/prisma/enums";

const privilegedFields = z.object({
	id: z.never({ error: "id cannot be set here" }).optional(),
	tenantId: z.never({ error: "tenantId cannot be set here" }).optional(),
	tenant_id: z.never({ error: "tenant_id cannot be set here" }).optional(),
	roomId: z.never({ error: "roomId cannot be set here" }).optional(),
	propertyId: z.never({ error: "propertyId cannot be set here" }).optional(),
	ownerId: z.never({ error: "ownerId cannot be set here" }).optional(),
	managerId: z.never({ error: "managerId cannot be set here" }).optional(),
	status: z.never({ error: "status cannot be set here" }).optional(),
	deletedAt: z.never({ error: "deletedAt cannot be set here" }).optional(),
	deleted_at: z.never({ error: "deleted_at cannot be set here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be set here" }).optional(),
	updatedAt: z.never({ error: "updatedAt cannot be set here" }).optional(),
});

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value));

export const CreateLeaseZodSchema = z
	.object({
		applicationId: z.uuid({ error: "applicationId must be a valid UUID" }),
		startDate: isoDate("startDate"),
		endDate: isoDate("endDate").optional(),
	})
	.strict()
	.and(privilegedFields)
	.refine((value) => !value.endDate || value.startDate < value.endDate, {
		message: "startDate must be before endDate",
		path: ["endDate"],
	});

export const LeaseParamZodSchema = z.object({
	id: z.uuid({ error: "Lease id must be a valid UUID" }),
});

export const LeaseQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		status: z.enum(Object.values(LeaseStatus)).optional(),
		propertyId: z.uuid({ error: "propertyId must be a valid UUID" }).optional(),
		roomId: z.uuid({ error: "roomId must be a valid UUID" }).optional(),
		tenantId: z.uuid({ error: "tenantId must be a valid UUID" }).optional(),
		from: isoDate("from").optional(),
		to: isoDate("to").optional(),
		sortBy: z
			.enum(["startDate", "endDate", "createdAt", "updatedAt", "status"])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: "from must be before to",
		path: ["to"],
	});

export const LeaseValidation = {
	CreateLeaseZodSchema,
	LeaseParamZodSchema,
	LeaseQueryZodSchema,
};
