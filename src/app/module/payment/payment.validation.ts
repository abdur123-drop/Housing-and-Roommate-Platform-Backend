import { z } from "zod";
import { RentPaymentStatus } from "../../../generated/prisma/enums";

export const CreatePaymentZodSchema = z
	.object({
		leaseId: z.uuid({ error: "leaseId must be a valid UUID" }),
	})
	.strict()
	.refine((value) => !("amount" in value), {
		message: "amount is server-controlled",
		path: ["amount"],
	});

export const PaymentParamZodSchema = z.object({
	id: z.uuid({ error: "Payment id must be a valid UUID" }),
});

export const PaymentQueryZodSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
	status: z.enum(Object.values(RentPaymentStatus)).optional(),
	sortBy: z
		.enum(["createdAt", "updatedAt", "paidAt", "amount", "status"])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const PaymentValidation = {
	CreatePaymentZodSchema,
	PaymentParamZodSchema,
	PaymentQueryZodSchema,
};
