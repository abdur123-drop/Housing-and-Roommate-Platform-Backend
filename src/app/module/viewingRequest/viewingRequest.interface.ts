import type { ViewingRequestStatus } from "../../../generated/prisma/enums";

export type TCreateViewingRequestPayload = {
	roomId: string;
	requestedDate: Date;
	requestedTime?: string;
	message?: string;
};

export type TViewingRequestQuery = {
	page: number;
	limit: number;
	status?: ViewingRequestStatus;
	propertyId?: string;
	roomId?: string;
	from?: Date;
	to?: Date;
	sortBy: "requestedDate" | "createdAt" | "updatedAt" | "status";
	sortOrder: "asc" | "desc";
};

export type TViewingRequestAction = "approve" | "reject" | "cancel";
