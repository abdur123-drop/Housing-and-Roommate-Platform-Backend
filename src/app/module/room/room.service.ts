import httpStatus from "http-status";
import {
	Prisma,
	type PrismaClient,
	RoomStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateRoomPayload,
	TRoomQuery,
	TUpdateRoomPayload,
} from "./room.interface";

let roomPrisma: PrismaClient = prisma;

export const setRoomPrismaForTest = (client: PrismaClient): void => {
	roomPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetRoomPrismaForTest = (): void => {
	roomPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const roomSelect = {
	id: true,
	unitId: true,
	roomNumber: true,
	name: true,
	roomType: true,
	monthlyRent: true,
	securityDeposit: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} as const;

const mapConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An active room with this number already exists for this unit",
		);
	}

	throw error;
};

const listRooms = async (
	unitId: string,
	query: TRoomQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"unit",
		unitId,
		"access",
		undefined,
		true,
	);

	const where: Prisma.RoomWhereInput = {
		unitId,
		deletedAt: null,
		unit: {
			deletedAt: null,
			building: { deletedAt: null, property: { deletedAt: null } },
		},
	};

	if (query.search) {
		where.OR = [
			{ roomNumber: { contains: query.search, mode: "insensitive" } },
			{ name: { contains: query.search, mode: "insensitive" } },
		];
	}

	if (query.status) {
		where.status = query.status;
	}

	if (query.roomType) {
		where.roomType = query.roomType;
	}

	const skip = (query.page - 1) * query.limit;
	const [data, total] = await roomPrisma.$transaction([
		roomPrisma.room.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: roomSelect,
		}),
		roomPrisma.room.count({ where }),
	]);

	return {
		data,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const createRoom = async (
	unitId: string,
	payload: TCreateRoomPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"unit",
		unitId,
		"access",
		undefined,
		true,
	);

	try {
		return await roomPrisma.room.create({
			data: {
				...payload,
				unitId,
				status: payload.status ?? RoomStatus.AVAILABLE,
				securityDeposit: payload.securityDeposit ?? "0",
			},
			select: roomSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const getRoomById = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"room",
		id,
		"access",
		undefined,
		true,
	);

	const room = await roomPrisma.room.findFirst({
		where: {
			id,
			deletedAt: null,
			unit: {
				deletedAt: null,
				building: { deletedAt: null, property: { deletedAt: null } },
			},
		},
		select: roomSelect,
	});

	if (!room) {
		throw new AppError(httpStatus.NOT_FOUND, "Room not found");
	}

	return room;
};

const updateRoom = async (
	id: string,
	payload: TUpdateRoomPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"room",
		id,
		"access",
		undefined,
		true,
	);

	try {
		return await roomPrisma.room.update({
			where: { id },
			data: payload,
			select: roomSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const deleteRoom = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"room",
		id,
		"access",
		undefined,
		true,
	);

	return roomPrisma.room.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: roomSelect,
	});
};

export const RoomServices = {
	createRoom,
	getRoomById,
	listRooms,
	updateRoom,
	deleteRoom,
};
