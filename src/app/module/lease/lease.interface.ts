import type { LeaseStatus } from "../../../generated/prisma/enums";

export type TCreateLeasePayload = {
	applicationId: string;
	startDate: Date;
	endDate?: Date;
};

export type TLeaseQuery = {
	page: number;
	limit: number;
	status?: LeaseStatus;
	propertyId?: string;
	roomId?: string;
	tenantId?: string;
	from?: Date;
	to?: Date;
	sortBy: "startDate" | "endDate" | "createdAt" | "updatedAt" | "status";
	sortOrder: "asc" | "desc";
};
