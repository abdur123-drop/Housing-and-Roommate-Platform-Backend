import { z } from "zod";
import { AuditAction, AuditResourceType } from "../../utils/audit";

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true })
		.transform((value) => new Date(value));

export const AuditLogQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(50),
		action: z.enum(Object.values(AuditAction)).optional(),
		entityType: z.enum(Object.values(AuditResourceType)).optional(),
		entityId: z.uuid({ error: "entityId must be a valid UUID" }).optional(),
		actorUserId: z
			.uuid({ error: "actorUserId must be a valid UUID" })
			.optional(),
		from: isoDate("from").optional(),
		to: isoDate("to").optional(),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: "from must be before to",
		path: ["to"],
	});

export const AuditLogValidation = { AuditLogQueryZodSchema };
