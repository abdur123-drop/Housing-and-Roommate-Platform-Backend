import { z } from "zod";
import {
	UtilityBillStatus,
	UtilityType,
} from "../../../generated/prisma/enums";

const money = z
	.string({ error: "Amount is required" })
	.trim()
	.regex(/^\d+(\.\d{1,2})?$/, "Amount must have at most two decimal places")
	.refine(
		(value) => Number(value) > 0 && Number.isFinite(Number(value)),
		"Amount must be positive",
	);

const isoDate = (field: string) =>
	z
		.string({ error: `${field} is required` })
		.datetime({ offset: true, message: `${field} must be a valid ISO date` })
		.transform((value) => new Date(value));

const forbidden = z.object({
	id: z.never({ error: "id cannot be set here" }).optional(),
	currency: z.never({ error: "currency is fixed to BDT" }).optional(),
	ownerId: z.never({ error: "ownerId cannot be set here" }).optional(),
	managerId: z.never({ error: "managerId cannot be set here" }).optional(),
	status: z.never({ error: "status cannot be set here" }).optional(),
	paidAt: z.never({ error: "paidAt cannot be set here" }).optional(),
	deletedAt: z.never({ error: "deletedAt cannot be set here" }).optional(),
	createdAt: z.never({ error: "createdAt cannot be set here" }).optional(),
	updatedAt: z.never({ error: "updatedAt cannot be set here" }).optional(),
});

export const CreateUtilityBillZodSchema = z
	.object({
		propertyId: z.uuid({ error: "propertyId must be a valid UUID" }),
		unitId: z.uuid({ error: "unitId must be a valid UUID" }).optional(),
		type: z.enum(Object.values(UtilityType), { error: "Invalid utility type" }),
		totalAmount: money,
		billingPeriodStart: isoDate("billingPeriodStart"),
		billingPeriodEnd: isoDate("billingPeriodEnd"),
		dueDate: isoDate("dueDate"),
	})
	.strict()
	.and(forbidden)
	.refine((value) => value.billingPeriodStart < value.billingPeriodEnd, {
		message: "billingPeriodStart must be before billingPeriodEnd",
		path: ["billingPeriodEnd"],
	});

export const UtilityBillParamZodSchema = z.object({
	id: z.uuid({ error: "Utility bill id must be a valid UUID" }),
});

export const UtilityBillSplitParamZodSchema = z.object({
	billId: z.uuid({ error: "Utility bill id must be a valid UUID" }),
});

export const CreateUtilitySplitZodSchema = z
	.object({
		tenantId: z.uuid({ error: "tenantId must be a valid UUID" }),
		amount: money,
	})
	.strict()
	.and(forbidden.pick({ status: true, paidAt: true, deletedAt: true }));

export const UtilityBillQueryZodSchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		status: z.enum(Object.values(UtilityBillStatus)).optional(),
		type: z.enum(Object.values(UtilityType)).optional(),
		from: isoDate("from").optional(),
		to: isoDate("to").optional(),
		sortBy: z
			.enum([
				"createdAt",
				"updatedAt",
				"totalAmount",
				"dueDate",
				"billingPeriodStart",
				"billingPeriodEnd",
				"status",
			])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: "from must be before to",
		path: ["to"],
	});

export const UtilityBillValidation = {
	CreateUtilityBillZodSchema,
	UtilityBillParamZodSchema,
	UtilityBillSplitParamZodSchema,
	CreateUtilitySplitZodSchema,
	UtilityBillQueryZodSchema,
};
