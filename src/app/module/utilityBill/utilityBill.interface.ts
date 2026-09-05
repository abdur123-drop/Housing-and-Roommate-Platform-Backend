import type {
	UtilityBillStatus,
	UtilitySplitStatus,
	UtilityType,
} from "../../../generated/prisma/enums";

export type TCreateUtilityBillPayload = {
	propertyId: string;
	unitId?: string;
	type: UtilityType;
	totalAmount: string;
	billingPeriodStart: Date;
	billingPeriodEnd: Date;
	dueDate: Date;
};

export type TUtilityBillQuery = {
	page: number;
	limit: number;
	status?: UtilityBillStatus;
	type?: UtilityType;
	from?: Date;
	to?: Date;
	sortBy:
		| "createdAt"
		| "updatedAt"
		| "totalAmount"
		| "dueDate"
		| "billingPeriodStart"
		| "billingPeriodEnd"
		| "status";
	sortOrder: "asc" | "desc";
};

export type TCreateUtilitySplitPayload = {
	tenantId: string;
	amount: string;
};

export type TUtilitySplitStatus = UtilitySplitStatus;
