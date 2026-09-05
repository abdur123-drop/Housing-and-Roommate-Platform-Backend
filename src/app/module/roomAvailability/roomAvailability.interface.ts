import type { AvailabilityStatus } from "../../../generated/prisma/enums";

export type TCreateRoomAvailabilityPayload = {
	availableFrom: Date;
	availableTo: Date;
	status?: AvailabilityStatus;
};

export type TUpdateRoomAvailabilityPayload =
	Partial<TCreateRoomAvailabilityPayload>;

export type TRoomAvailabilityQuery = {
	page: number;
	limit: number;
	status?: AvailabilityStatus;
	from?: Date;
	to?: Date;
	sortBy: "availableFrom" | "availableTo" | "createdAt" | "updatedAt";
	sortOrder: "asc" | "desc";
};
