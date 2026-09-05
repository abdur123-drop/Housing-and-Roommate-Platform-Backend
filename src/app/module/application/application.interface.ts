import type { ApplicationStatus } from "../../../generated/prisma/enums";

export type TCreateApplicationPayload = {
	roomId: string;
	viewingRequestId?: string;
	message?: string;
};

export type TApplicationQuery = {
	page: number;
	limit: number;
	status?: ApplicationStatus;
	propertyId?: string;
	roomId?: string;
	from?: Date;
	to?: Date;
	sortBy: "submittedAt" | "updatedAt" | "status";
	sortOrder: "asc" | "desc";
};

export type TApplicationAction = "approve" | "reject" | "withdraw";
