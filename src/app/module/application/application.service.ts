import httpStatus from "http-status";
import {
	ApplicationStatus,
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
	TApplicationAction,
	TApplicationQuery,
	TCreateApplicationPayload,
} from "./application.interface";

let applicationPrisma: PrismaClient = prisma;

export const setApplicationPrismaForTest = (client: PrismaClient): void => {
	applicationPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetApplicationPrismaForTest = (): void => {
	applicationPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const applicationSelect = {
	id: true,
	userId: true,
	roomId: true,
	viewingRequestId: true,
	message: true,
	status: true,
	submittedAt: true,
	updatedAt: true,
	user: {
		select: {
			id: true,
			name: true,
			avatar: true,
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
						},
					},
				},
			},
		},
	},
	viewingRequest: {
		select: {
			id: true,
			status: true,
			requestedDate: true,
			requestedTime: true,
		},
	},
} as const;

type ApplicationRecord = Prisma.ApplicationGetPayload<{
	select: typeof applicationSelect;
}>;

const TERMINAL_STATUSES = new Set<ApplicationStatus>([
	ApplicationStatus.APPROVED,
	ApplicationStatus.REJECTED,
	ApplicationStatus.WITHDRAWN,
]);

const ensureTenant = (user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can create or withdraw applications.",
		);
	}
};

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);

const toNumber = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	const numberValue = Number(value.toString());
	return Number.isFinite(numberValue) ? numberValue : null;
};

const getPropertyFromApplication = (application: ApplicationRecord) =>
	application.room.unit.building.property;

const toDto = (application: ApplicationRecord) => {
	const property = getPropertyFromApplication(application);

	return {
		id: application.id,
		userId: application.userId,
		roomId: application.roomId,
		viewingRequestId: application.viewingRequestId,
		message: application.message,
		status: application.status,
		submittedAt: application.submittedAt,
		updatedAt: application.updatedAt,
		tenant: application.user,
		property,
		room: {
			id: application.room.id,
			roomNumber: application.room.roomNumber,
			name: application.room.name,
			roomType: application.room.roomType,
			monthlyRent: toNumber(application.room.monthlyRent),
			unit: {
				id: application.room.unit.id,
				unitNumber: application.room.unit.unitNumber,
				building: {
					id: application.room.unit.building.id,
					name: application.room.unit.building.name,
				},
			},
		},
		viewingRequest: application.viewingRequest,
	};
};

const getRoomForApplication = async (roomId: string) => {
	const room = await applicationPrisma.room.findFirst({
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
							property: { select: { id: true } },
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

const assertRoomHasAvailability = async (roomId: string) => {
	const availability = await applicationPrisma.roomAvailability.findFirst({
		where: {
			roomId,
			deletedAt: null,
			status: AvailabilityStatus.AVAILABLE,
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
		select: { id: true },
	});

	if (!availability) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Room is not available for applications",
		);
	}
};

const assertViewingRequestCanBeLinked = async (
	viewingRequestId: string | undefined,
	roomId: string,
	userId: string,
) => {
	if (!viewingRequestId) return;

	const viewingRequest = await applicationPrisma.viewingRequest.findFirst({
		where: {
			id: viewingRequestId,
			userId,
			roomId,
			deletedAt: null,
			status: ViewingRequestStatus.APPROVED,
		},
		select: { id: true },
	});

	if (!viewingRequest) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Viewing request is not valid for this application",
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
			"A pending application already exists for this room",
		);
	}

	throw error;
};

const createApplication = async (
	payload: TCreateApplicationPayload,
	user: RequestUser,
) => {
	ensureTenant(user);
	const room = await getRoomForApplication(payload.roomId);
	await assertRoomHasAvailability(room.id);
	await assertViewingRequestCanBeLinked(
		payload.viewingRequestId,
		room.id,
		user.id,
	);

	try {
		const application = await applicationPrisma.application.create({
			data: {
				userId: user.id,
				roomId: room.id,
				viewingRequestId: payload.viewingRequestId,
				message: payload.message,
				status: ApplicationStatus.PENDING,
			},
			select: applicationSelect,
		});

		return toDto(application);
	} catch (error) {
		return mapDuplicateConflict(error);
	}
};

const buildListWhere = (
	query: TApplicationQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "property"; propertyId: string }
		| { type: "managed"; user: RequestUser },
): Prisma.ApplicationWhereInput => {
	const andConditions: Prisma.ApplicationWhereInput[] = [
		{
			deletedAt: null,
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
		andConditions.push({
			room: {
				unit: {
					building: {
						propertyId: scope.propertyId,
						property: { deletedAt: null },
					},
				},
			},
		});
	}

	if (scope.type === "managed" && !isAdmin(scope.user)) {
		andConditions.push({
			room: {
				unit: {
					building: {
						property: {
							deletedAt: null,
							OR: [
								{ ownerId: scope.user.id },
								{ managerId: scope.user.id },
							],
						},
					},
				},
			},
		});
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.propertyId) {
		andConditions.push({
			room: {
				unit: {
					building: {
						propertyId: query.propertyId,
						property: { deletedAt: null },
					},
				},
			},
		});
	}

	if (query.roomId) {
		andConditions.push({ roomId: query.roomId });
	}

	if (query.from || query.to) {
		andConditions.push({
			submittedAt: {
				gte: query.from,
				lt: query.to,
			},
		});
	}

	return { AND: andConditions };
};

const listWithMeta = async (
	query: TApplicationQuery,
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
	] as Prisma.ApplicationOrderByWithRelationInput[];

	const [data, total] = await applicationPrisma.$transaction([
		applicationPrisma.application.findMany({
			where,
			skip,
			take: query.limit,
			orderBy,
			select: applicationSelect,
		}),
		applicationPrisma.application.count({ where }),
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

const getMyApplications = async (query: TApplicationQuery, user: RequestUser) => {
	ensureTenant(user);
	return listWithMeta(query, { type: "tenant", userId: user.id });
};

const getManagedApplications = async (
	query: TApplicationQuery,
	user: RequestUser,
) => {
	if (
		!isAdmin(user) &&
		!user.roles.some((role) => role === AppRole.OWNER || role === AppRole.TENANT)
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

const getPropertyApplications = async (
	propertyId: string,
	query: TApplicationQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(user, propertyId, "access", true);
	return listWithMeta(query, { type: "property", propertyId });
};

const getApplicationForAccess = async (id: string) => {
	const application = await applicationPrisma.application.findFirst({
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
		select: {
			...applicationSelect,
			room: {
				select: {
					...applicationSelect.room.select,
					unit: {
						select: {
							...applicationSelect.room.select.unit.select,
							building: {
								select: {
									...applicationSelect.room.select.unit.select.building.select,
									property: {
										select: {
											...applicationSelect.room.select.unit.select.building
												.select.property.select,
											ownerId: true,
											managerId: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	if (!application) {
		throw new AppError(httpStatus.NOT_FOUND, "Application not found");
	}

	return application as ApplicationRecord;
};

const assertApplicationAccess = (
	application: ApplicationRecord,
	user: RequestUser,
	action?: TApplicationAction,
) => {
	if (isAdmin(user)) return;

	const property = getPropertyFromApplication(application) as ReturnType<
		typeof getPropertyFromApplication
	> & {
		ownerId?: string;
		managerId?: string | null;
	};

	if (action === "withdraw") {
		if (application.userId === user.id) return;
		throw new AppError(httpStatus.NOT_FOUND, "Application not found");
	}

	if (action === "approve" || action === "reject") {
		if (property.ownerId === user.id || property.managerId === user.id) return;
		throw new AppError(httpStatus.NOT_FOUND, "Application not found");
	}

	if (
		application.userId === user.id ||
		property.ownerId === user.id ||
		property.managerId === user.id
	) {
		return;
	}

	throw new AppError(httpStatus.NOT_FOUND, "Application not found");
};

const getApplicationById = async (id: string, user: RequestUser) => {
	const application = await getApplicationForAccess(id);
	assertApplicationAccess(application, user);
	return toDto(application);
};

const transitionApplication = async (
	id: string,
	action: TApplicationAction,
	user: RequestUser,
) => {
	const nextStatus =
		action === "approve"
			? ApplicationStatus.APPROVED
			: action === "reject"
				? ApplicationStatus.REJECTED
				: ApplicationStatus.WITHDRAWN;
	const application = await getApplicationForAccess(id);
	assertApplicationAccess(application, user, action);

	if (TERMINAL_STATUSES.has(application.status)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Application has already reached a terminal status",
		);
	}

	const updated = await applicationPrisma.application.updateMany({
		where: { id, deletedAt: null, status: ApplicationStatus.PENDING },
		data: { status: nextStatus },
	});

	if (updated.count !== 1) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Application has already been processed",
		);
	}

	const result = await applicationPrisma.application.findFirst({
		where: { id, deletedAt: null },
		select: applicationSelect,
	});

	if (!result) {
		throw new AppError(httpStatus.NOT_FOUND, "Application not found");
	}

	return toDto(result);
};

export const ApplicationServices = {
	createApplication,
	getMyApplications,
	getManagedApplications,
	getPropertyApplications,
	getApplicationById,
	transitionApplication,
};
