import httpStatus from "http-status";
import {
	AvailabilityStatus,
	Prisma,
	type PrismaClient,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateRoomAvailabilityPayload,
	TRoomAvailabilityQuery,
	TUpdateRoomAvailabilityPayload,
} from "./roomAvailability.interface";

type AvailabilityPrisma = PrismaClient;
type AvailabilityTx = Prisma.TransactionClient;

let availabilityPrisma: AvailabilityPrisma = prisma;

export const setRoomAvailabilityPrismaForTest = (
	client: AvailabilityPrisma,
): void => {
	availabilityPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetRoomAvailabilityPrismaForTest = (): void => {
	availabilityPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const availabilitySelect = {
	id: true,
	roomId: true,
	availableFrom: true,
	availableTo: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} as const;

const OVERLAP_MESSAGE =
	"Room availability period overlaps an existing availability period";

const assertValidRange = (availableFrom: Date, availableTo: Date): void => {
	if (availableFrom.getTime() >= availableTo.getTime()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"availableFrom must be before availableTo",
		);
	}
};

const lockRoomAvailability = async (
	tx: Pick<AvailabilityTx, "$executeRaw">,
	roomId: string,
) => {
	await tx.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`,
	);
};

const buildOverlapWhere = (
	roomId: string,
	availableFrom: Date,
	availableTo: Date,
	excludeId?: string,
): Prisma.RoomAvailabilityWhereInput => ({
	roomId,
	deletedAt: null,
	id: excludeId ? { not: excludeId } : undefined,
	availableFrom: { lt: availableTo },
	OR: [{ availableTo: null }, { availableTo: { gt: availableFrom } }],
});

const assertNoOverlap = async (
	tx: Pick<AvailabilityTx, "roomAvailability">,
	roomId: string,
	availableFrom: Date,
	availableTo: Date,
	excludeId?: string,
) => {
	const overlap = await tx.roomAvailability.findFirst({
		where: buildOverlapWhere(roomId, availableFrom, availableTo, excludeId),
		select: { id: true },
	});

	if (overlap) {
		throw new AppError(httpStatus.CONFLICT, OVERLAP_MESSAGE);
	}
};

const createAvailability = async (
	roomId: string,
	payload: TCreateRoomAvailabilityPayload,
	user: RequestUser,
) => {
	assertValidRange(payload.availableFrom, payload.availableTo);
	await AuthorizationService.authorizePropertyResource(
		user,
		"room",
		roomId,
		"access",
		undefined,
		true,
	);

	return availabilityPrisma.$transaction(async (tx) => {
		await lockRoomAvailability(tx, roomId);
		await assertNoOverlap(
			tx,
			roomId,
			payload.availableFrom,
			payload.availableTo,
		);

		return tx.roomAvailability.create({
			data: {
				roomId,
				availableFrom: payload.availableFrom,
				availableTo: payload.availableTo,
				status: payload.status ?? AvailabilityStatus.AVAILABLE,
			},
			select: availabilitySelect,
		});
	});
};

const getAvailabilityById = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"roomAvailability",
		id,
		"access",
		undefined,
		true,
	);

	const availability = await availabilityPrisma.roomAvailability.findFirst({
		where: {
			id,
			deletedAt: null,
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
		select: availabilitySelect,
	});

	if (!availability) {
		throw new AppError(httpStatus.NOT_FOUND, "Room availability not found");
	}

	return availability;
};

const listAvailability = async (
	roomId: string,
	query: TRoomAvailabilityQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"room",
		roomId,
		"access",
		undefined,
		true,
	);

	const where: Prisma.RoomAvailabilityWhereInput = {
		roomId,
		deletedAt: null,
		room: {
			deletedAt: null,
			unit: {
				deletedAt: null,
				building: { deletedAt: null, property: { deletedAt: null } },
			},
		},
	};

	if (query.status) {
		where.status = query.status;
	}

	if (query.from || query.to) {
		where.availableFrom = query.to ? { lt: query.to } : undefined;
		where.OR = query.from
			? [{ availableTo: null }, { availableTo: { gt: query.from } }]
			: undefined;
	}

	const skip = (query.page - 1) * query.limit;
	const [data, total] = await availabilityPrisma.$transaction([
		availabilityPrisma.roomAvailability.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: availabilitySelect,
		}),
		availabilityPrisma.roomAvailability.count({ where }),
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

const updateAvailability = async (
	id: string,
	payload: TUpdateRoomAvailabilityPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"roomAvailability",
		id,
		"access",
		undefined,
		true,
	);

	const existing = await availabilityPrisma.roomAvailability.findFirst({
		where: { id, deletedAt: null },
		select: { id: true, roomId: true, availableFrom: true, availableTo: true },
	});

	if (!existing?.availableTo) {
		throw new AppError(httpStatus.NOT_FOUND, "Room availability not found");
	}

	const availableFrom = payload.availableFrom ?? existing.availableFrom;
	const availableTo = payload.availableTo ?? existing.availableTo;
	assertValidRange(availableFrom, availableTo);

	return availabilityPrisma.$transaction(async (tx) => {
		await lockRoomAvailability(tx, existing.roomId);
		await assertNoOverlap(tx, existing.roomId, availableFrom, availableTo, id);

		return tx.roomAvailability.update({
			where: { id },
			data: payload,
			select: availabilitySelect,
		});
	});
};

const deleteAvailability = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"roomAvailability",
		id,
		"access",
		undefined,
		true,
	);

	return availabilityPrisma.roomAvailability.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: availabilitySelect,
	});
};

export const RoomAvailabilityServices = {
	createAvailability,
	getAvailabilityById,
	listAvailability,
	updateAvailability,
	deleteAvailability,
};
