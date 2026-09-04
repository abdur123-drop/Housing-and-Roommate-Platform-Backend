import type { RoomStatus, RoomType } from "../../../generated/prisma/enums";

export type TCreateRoomPayload = {
	roomNumber: string;
	name?: string;
	roomType: RoomType;
	monthlyRent: string;
	securityDeposit?: string;
	status?: RoomStatus;
};

export type TUpdateRoomPayload = Partial<TCreateRoomPayload>;

export type TRoomQuery = {
	page: number;
	limit: number;
	search?: string;
	status?: RoomStatus;
	roomType?: RoomType;
	sortBy:
		| "roomNumber"
		| "name"
		| "roomType"
		| "monthlyRent"
		| "status"
		| "createdAt"
		| "updatedAt";
	sortOrder: "asc" | "desc";
};
