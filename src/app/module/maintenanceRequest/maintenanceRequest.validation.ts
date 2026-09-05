import { z } from "zod";
import {
	MaintenancePriority,
	MaintenanceStatus,
} from "../../../generated/prisma/enums";

const text = (field: string, max: number) =>
	z
		.string({ error: `${field} is required` })
		.trim()
		.min(1, `${field} cannot be empty`)
		.max(max, `${field} is too long`);

const privileged = z.object({
	id: z.never({ error: "id cannot be set here" }).optional(),
	tenantId: z.never({ error: "tenantId cannot be set here" }).optional(),
	userId: z.never({ error: "userId cannot be set here" }).optional(),
	propertyId: z.never({ error: "propertyId cannot be set here" }).optional(),
	leaseId: z.never({ error: "leaseId cannot be set here" }).optional(),
	status: z.never({ error: "status cannot be set here" }).optional(),
	resolvedAt: z.never({ error: "resolvedAt cannot be set here" }).optional(),
	deletedAt: z.never({ error: "deletedAt cannot be set here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be set here" }).optional(),
	updatedAt: z.never({ error: "updatedAt cannot be set here" }).optional(),
});

export const CreateMaintenanceRequestZodSchema = z
	.object({
		roomId: z.uuid({ error: "roomId must be a valid UUID" }),
		title: text("title", 160),
		description: text("description", 5000),
		priority: z
			.enum(Object.values(MaintenancePriority), { error: "Invalid priority" })
			.optional(),
	})
	.strict()
	.and(privileged);

export const UpdateMaintenanceRequestZodSchema = z
	.object({
		title: text("title", 160).optional(),
		description: text("description", 5000).optional(),
		priority: z
			.enum(Object.values(MaintenancePriority), { error: "Invalid priority" })
			.optional(),
	})
	.strict()
	.and(privileged)
	.refine(
		(value) => Object.keys(value).length > 0,
		"At least one mutable field is required",
	);

export const MaintenanceRequestParamZodSchema = z.object({
	id: z.uuid({ error: "Maintenance request id must be a valid UUID" }),
});

export const MaintenanceRequestQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		status: z.enum(Object.values(MaintenanceStatus)).optional(),
		priority: z.enum(Object.values(MaintenancePriority)).optional(),
		search: z.string().trim().min(1).max(100).optional(),
		sortBy: z
			.enum(["createdAt", "updatedAt", "priority", "status", "resolvedAt"])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export const MaintenanceRequestValidation = {
	CreateMaintenanceRequestZodSchema,
	UpdateMaintenanceRequestZodSchema,
	MaintenanceRequestParamZodSchema,
	MaintenanceRequestQueryZodSchema,
};
