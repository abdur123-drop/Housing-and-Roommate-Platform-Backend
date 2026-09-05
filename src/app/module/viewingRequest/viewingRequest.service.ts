import httpStatus from "http-status";
import {
	AvailabilityStatus,
	Prisma,
	type PrismaClient,
	PropertyStatus,
	RoomStatus,
	ViewingRequestStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateViewingRequestPayload,
	TViewingRequestAction,
	TViewingRequestQuery,
} from "./viewingRequest.interface";

let viewingRequestPrisma: PrismaClient = prisma;

export const setViewingRequestPrismaForTest = (client: PrismaClient): void => {
	viewingRequestPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetViewingRequestPrismaForTest = (): void => {
	viewingRequestPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const requestSelect = {
	id: true,
	userId: true,
	propertyId: true,
	roomId: true,
	requestedDate: true,
	requestedTime: true,
	message: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	user: {
		select: {
			id: true,
			name: true,
			avatar: true,
		},
	},
	property: {
		select: {
			id: true,
			title: true,
			propertyType: true,
			address: true,
			city: true,
			state: true,
			country: true,
		},
	},
	room: {
		select: {
			id: true,
			roomNumber: true,
			name: true,
			roomType: true,
			monthlyRent: true,
			unit: {
				select: {
					id: true,
					unitNumber: true,
					building: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			},
		},
	},
} as const;

type ViewingRequestRecord = Prisma.ViewingRequestGetPayload<{
	select: typeof requestSelect;
}>;

const TERMINAL_STATUSES = new Set<ViewingRequestStatus>([
	ViewingRequestStatus.APPROVED,
	ViewingRequestStatus.REJECTED,
	ViewingRequestStatus.CANCELLED,
	ViewingRequestStatus.COMPLETED,
]);

const ensureTenant = (user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can create or cancel viewing requests.",
		);
	}
};

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);

const toNumber = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	const numberValue = Number(value.toString());
	return Number.isFinite(numberValue) ? numberValue : null;
};

const toDto = (request: ViewingRequestRecord) => ({
	id: request.id,
	userId: request.userId,
	propertyId: request.propertyId,
	roomId: request.roomId,
	requestedDate: request.requestedDate,
	requestedTime: request.requestedTime,
	message: request.message,
	status: request.status,
	createdAt: request.createdAt,
	updatedAt: request.updatedAt,
	tenant: request.user,
	property: {
		id: request.property.id,
		title: request.property.title,
		propertyType: request.property.propertyType,
		address: request.property.address,
		city: request.property.city,
		state: request.property.state,
		country: request.property.country,
	},
	room: request.room
		? {
				id: request.room.id,
				roomNumber: request.room.roomNumber,
				name: request.room.name,
				roomType: request.room.roomType,
				monthlyRent: toNumber(request.room.monthlyRent),
				unit: request.room.unit,
			}
		: null,
});

const buildAvailabilityWhere = (
	roomId: string,
	requestedDate: Date,
): Prisma.RoomAvailabilityWhereInput => ({
	roomId,
	deletedAt: null,
	status: AvailabilityStatus.AVAILABLE,
	availableFrom: { lte: requestedDate },
	OR: [{ availableTo: null }, { availableTo: { gt: requestedDate } }],
});

const getRoomForViewing = async (roomId: string) => {
	const room = await viewingRequestPrisma.room.findFirst({
		where: {
			id: roomId,
			deletedAt: null,
			status: RoomStatus.AVAILABLE,
			unit: {
				deletedAt: null,
				building: {
					deletedAt: null,
					property: {
						deletedAt: null,
						status: PropertyStatus.PUBLISHED,
					},
				},
			},
		},
		select: {
			id: true,
			unit: {
				select: {
					building: {
						select: {
							property: {
								select: { id: true },
							},
						},
					},
				},
			},
		},
	});

	if (!room) {
		throw new AppError(httpStatus.NOT_FOUND, "Room not found");
	}

	return {
		id: room.id,
		propertyId: room.unit.building.property.id,
	};
};

const assertViewingDateIsFuture = (requestedDate: Date) => {
	if (requestedDate.getTime() <= Date.now()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"requestedDate must be in the future",
		);
	}
};

const assertRoomAvailableForViewing = async (
	roomId: string,
	requestedDate: Date,
) => {
	const availability = await viewingRequestPrisma.roomAvailability.findFirst({
		where: buildAvailabilityWhere(roomId, requestedDate),
		select: { id: true },
	});

	if (!availability) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Room is not available for viewing at the requested time",
		);
	}
};

const mapDuplicateConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A pending viewing request already exists for this room and time",
		);
	}

	throw error;
};

const createViewingRequest = async (
	payload: TCreateViewingRequestPayload,
	user: RequestUser,
) => {
	ensureTenant(user);
	assertViewingDateIsFuture(payload.requestedDate);

	const room = await getRoomForViewing(payload.roomId);
	await assertRoomAvailableForViewing(room.id, payload.requestedDate);

	try {
		const request = await viewingRequestPrisma.viewingRequest.create({
			data: {
				userId: user.id,
				propertyId: room.propertyId,
				roomId: room.id,
				requestedDate: payload.requestedDate,
				requestedTime: payload.requestedTime,
				message: payload.message,
				status: ViewingRequestStatus.PENDING,
			},
			select: requestSelect,
		});

		return toDto(request);
	} catch (error) {
		return mapDuplicateConflict(error);
	}
};

const buildListWhere = (
	query: TViewingRequestQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "property"; propertyId: string }
		| { type: "managed"; user: RequestUser },
): Prisma.ViewingRequestWhereInput => {
	const andConditions: Prisma.ViewingRequestWhereInput[] = [
		{
			deletedAt: null,
			property: { deletedAt: null },
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
	];

	if (scope.type === "tenant") {
		andConditions.push({ userId: scope.userId });
	}

	if (scope.type === "property") {
		andConditions.push({ propertyId: scope.propertyId });
	}

	if (scope.type === "managed" && !isAdmin(scope.user)) {
		andConditions.push({
			property: {
				deletedAt: null,
				OR: [{ ownerId: scope.user.id }, { managerId: scope.user.id }],
			},
		});
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.propertyId) {
		andConditions.push({ propertyId: query.propertyId });
	}

	if (query.roomId) {
		andConditions.push({ roomId: query.roomId });
	}

	if (query.from || query.to) {
		andConditions.push({
			requestedDate: {
				gte: query.from,
				lt: query.to,
			},
		});
	}

	return { AND: andConditions };
};

const listWithMeta = async (
	query: TViewingRequestQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "property"; propertyId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const skip = (query.page - 1) * query.limit;
	const where = buildListWhere(query, scope);
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		{ id: "asc" },
	] as Prisma.ViewingRequestOrderByWithRelationInput[];

	const [data, total] = await viewingRequestPrisma.$transaction([
		viewingRequestPrisma.viewingRequest.findMany({
			where,
			skip,
			take: query.limit,
			orderBy,
			select: requestSelect,
		}),
		viewingRequestPrisma.viewingRequest.count({ where }),
	]);

	return {
		data: data.map(toDto),
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const getMyViewingRequests = async (
	query: TViewingRequestQuery,
	user: RequestUser,
) => {
	ensureTenant(user);
	return listWithMeta(query, { type: "tenant", userId: user.id });
};

const getManagedViewingRequests = async (
	query: TViewingRequestQuery,
	user: RequestUser,
) => {
	if (
		!isAdmin(user) &&
		!user.roles.some(
			(role) => role === AppRole.OWNER || role === AppRole.TENANT,
		)
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. You don't have permission to access this resource.",
		);
	}

	if (query.propertyId) {
		await AuthorizationService.authorizeProperty(
			user,
			query.propertyId,
			"access",
			true,
		);
	}

	return listWithMeta(query, { type: "managed", user });
};

const getPropertyViewingRequests = async (
	propertyId: string,
	query: TViewingRequestQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(
		user,
		propertyId,
		"access",
		true,
	);
	return listWithMeta(query, { type: "property", propertyId });
};

const assertRequestAccess = (
	request: ViewingRequestRecord,
	user: RequestUser,
	action?: TViewingRequestAction,
) => {
	if (isAdmin(user)) return;

	const property = request.property as ViewingRequestRecord["property"] & {
		ownerId?: string;
		managerId?: string | null;
	};

	if (action === "cancel") {
		if (request.userId === user.id) return;
		throw new AppError(httpStatus.NOT_FOUND, "Viewing request not found");
	}

	if (action === "approve" || action === "reject") {
		if (property.ownerId === user.id || property.managerId === user.id) return;
		throw new AppError(httpStatus.NOT_FOUND, "Viewing request not found");
	}

	if (
		request.userId === user.id ||
		property.ownerId === user.id ||
		property.managerId === user.id
	) {
		return;
	}

	throw new AppError(httpStatus.NOT_FOUND, "Viewing request not found");
};

const getRequestForAccess = async (id: string) => {
	const request = await viewingRequestPrisma.viewingRequest.findFirst({
		where: {
			id,
			deletedAt: null,
			property: { deletedAt: null },
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
		select: {
			...requestSelect,
			property: {
				select: {
					...requestSelect.property.select,
					ownerId: true,
					managerId: true,
				},
			},
		},
	});

	if (!request) {
		throw new AppError(httpStatus.NOT_FOUND, "Viewing request not found");
	}

	return request as ViewingRequestRecord;
};

const getViewingRequestById = async (id: string, user: RequestUser) => {
	const request = await getRequestForAccess(id);
	assertRequestAccess(request, user);
	return toDto(request);
};

const transitionViewingRequest = async (
	id: string,
	action: TViewingRequestAction,
	user: RequestUser,
) => {
	const nextStatus =
		action === "approve"
			? ViewingRequestStatus.APPROVED
			: action === "reject"
				? ViewingRequestStatus.REJECTED
				: ViewingRequestStatus.CANCELLED;
	const request = await getRequestForAccess(id);
	assertRequestAccess(request, user, action);

	if (TERMINAL_STATUSES.has(request.status)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Viewing request has already reached a terminal status",
		);
	}

	if (action === "approve" && request.roomId) {
		await assertRoomAvailableForViewing(request.roomId, request.requestedDate);
	}

	const updated = await viewingRequestPrisma.viewingRequest.updateMany({
		where: { id, deletedAt: null, status: ViewingRequestStatus.PENDING },
		data: { status: nextStatus },
	});

	if (updated.count !== 1) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Viewing request has already been processed",
		);
	}

	const result = await viewingRequestPrisma.viewingRequest.findFirst({
		where: { id, deletedAt: null },
		select: requestSelect,
	});

	if (!result) {
		throw new AppError(httpStatus.NOT_FOUND, "Viewing request not found");
	}

	return toDto(result);
};

export const ViewingRequestServices = {
	createViewingRequest,
	getMyViewingRequests,
	getManagedViewingRequests,
	getPropertyViewingRequests,
	getViewingRequestById,
	transitionViewingRequest,
};
