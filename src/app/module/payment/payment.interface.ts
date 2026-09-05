import type { RentPaymentStatus } from "../../../generated/prisma/enums";

export type TCreatePaymentPayload = {
	leaseId: string;
	idempotencyKey: string;
};

export type TPaymentQuery = {
	page: number;
	limit: number;
	status?: RentPaymentStatus;
	sortBy: "createdAt" | "updatedAt" | "paidAt" | "amount" | "status";
	sortOrder: "asc" | "desc";
};
