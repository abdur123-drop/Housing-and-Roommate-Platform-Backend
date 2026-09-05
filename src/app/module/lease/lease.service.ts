import httpStatus from "http-status";
import {
	ApplicationStatus,
	LeaseStatus,
	Prisma,
	RoomStatus,
	type PrismaClient,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type { TCreateLeasePayload, TLeaseQuery } from "./lease.interface";

type LeasePrisma = PrismaClient;
type LeaseTx = Prisma.TransactionClient;

let leasePrisma: LeasePrisma = prisma;

export const setLeasePrismaForTest = (client: LeasePrisma): void => {
	leasePrisma = client;
};

export const resetLeasePrismaForTest = (): void => {
	leasePrisma = prisma;
};

const leaseSelect = {
	id: true,
	applicationId: true,
	tenantId: true,
	roomId: true,
	startDate: true,
	endDate: true,
	monthlyRent: true,
	securityDeposit: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	tenant: { select: { id: true, name: true, avatar: true } },
	room: {
		select: {
			id: true,
			roomNumber: true,
			name: true,
			roomType: true,
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
									city: true,
									country: true,
								},
							},
						},
					},
				},
			},
		},
	},
} as const;

type LeaseRecord = Prisma.LeaseGetPayload<{ select: typeof leaseSelect }>;

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);

const toNumber = (value: unknown): number => Number(value?.toString() ?? 0);

const toDto = (lease: LeaseRecord) => ({
	id: lease.id,
	applicationId: lease.applicationId,
	tenantId: lease.tenantId,
	roomId: lease.roomId,
	startDate: lease.startDate,
	endDate: lease.endDate,
	monthlyRent: toNumber(lease.monthlyRent),
	securityDeposit: toNumber(lease.securityDeposit),
	status: lease.status,
	createdAt: lease.createdAt,
	updatedAt: lease.updatedAt,
	tenant: lease.tenant,
	room: {
		id: lease.room.id,
		roomNumber: lease.room.roomNumber,
		name: lease.room.name,
		roomType: lease.room.roomType,
		unit: {
			id: lease.room.unit.id,
			unitNumber: lease.room.unit.unitNumber,
			building: {
				id: lease.room.unit.building.id,
				name: lease.room.unit.building.name,
				property: lease.room.unit.building.property,
			},
		},
	},
});

const propertyFromLease = (lease: LeaseRecord) =>
	lease.room.unit.building
		.property as LeaseRecord["room"]["unit"]["building"]["property"] & {
		ownerId?: string;
		managerId?: string | null;
	};

const assertLeaseAccess = (lease: LeaseRecord, user: RequestUser) => {
	if (isAdmin(user)) return;
	const property = propertyFromLease(lease);
	if (
		lease.tenantId === user.id ||
		property.ownerId === user.id ||
		property.managerId === user.id
	) {
		return;
	}
	throw new AppError(httpStatus.NOT_FOUND, "Lease not found");
};

const getLeaseForAccess = async (id: string) => {
	const lease = await leasePrisma.lease.findFirst({
		where: {
			id,
			deletedAt: null,
			tenant: { deletedAt: null },
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: {
						deletedAt: null,
						property: { deletedAt: null },
					},
				},
			},
		},
		select: {
			...leaseSelect,
			room: {
				select: {
					...leaseSelect.room.select,
					unit: {
						select: {
							...leaseSelect.room.select.unit.select,
							building: {
								select: {
									...leaseSelect.room.select.unit.select.building.select,
									property: {
										select: {
											...leaseSelect.room.select.unit.select.building.select
												.property.select,
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
	if (!lease) throw new AppError(httpStatus.NOT_FOUND, "Lease not found");
	return lease as LeaseRecord;
};

const lockRoom = async (tx: Pick<LeaseTx, "$executeRaw">, roomId: string) => {
	await tx.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`,
	);
};

const mapConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		(error.code === "P2002" || error.code === "P2034")
	) {
		throw new AppError(httpStatus.CONFLICT, "Room already has an active lease");
	}
	throw error;
};

const createLease = async (payload: TCreateLeasePayload, user: RequestUser) => {
	if (
		!isAdmin(user) &&
		!user.roles.includes(AppRole.OWNER) &&
		!user.roles.includes(AppRole.TENANT)
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to create leases",
		);
	}
	if (payload.endDate && payload.startDate >= payload.endDate) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"startDate must be before endDate",
		);
	}

	const application = await leasePrisma.application.findFirst({
		where: {
			id: payload.applicationId,
			deletedAt: null,
			status: ApplicationStatus.APPROVED,
			user: { deletedAt: null },
			room: {
				deletedAt: null,
				status: RoomStatus.AVAILABLE,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
		select: {
			id: true,
			userId: true,
			roomId: true,
			message: true,
			room: {
				select: {
					monthlyRent: true,
					securityDeposit: true,
					unit: {
						select: {
							building: {
								select: {
									property: {
										select: { id: true, ownerId: true, managerId: true },
									},
								},
							},
						},
					},
				},
			},
		},
	});
	if (!application)
		throw new AppError(httpStatus.NOT_FOUND, "Eligible application not found");

	if (
		!isAdmin(user) &&
		application.room.unit.building.property.ownerId !== user.id &&
		application.room.unit.building.property.managerId !== user.id
	) {
		throw new AppError(httpStatus.NOT_FOUND, "Eligible application not found");
	}

	try {
		return await leasePrisma.$transaction(async (tx) => {
			await lockRoom(tx, application.roomId);
			const activeLease = await tx.lease.findFirst({
				where: {
					roomId: application.roomId,
					status: LeaseStatus.ACTIVE,
					deletedAt: null,
				},
				select: { id: true },
			});
			if (activeLease)
				throw new AppError(
					httpStatus.CONFLICT,
					"Room already has an active lease",
				);

			const existing = await tx.lease.findFirst({
				where: { applicationId: application.id, deletedAt: null },
				select: { id: true },
			});
			if (existing)
				throw new AppError(
					httpStatus.CONFLICT,
					"Application already has a lease",
				);

			return tx.lease.create({
				data: {
					applicationId: application.id,
					tenantId: application.userId,
					roomId: application.roomId,
					startDate: payload.startDate,
					endDate: payload.endDate,
					monthlyRent: application.room.monthlyRent,
					securityDeposit: application.room.securityDeposit,
					status: LeaseStatus.ACTIVE,
				},
				select: leaseSelect,
			});
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const buildWhere = (
	query: TLeaseQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const conditions: Prisma.LeaseWhereInput[] = [
		{
			deletedAt: null,
			tenant: { deletedAt: null },
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
	];
	if (scope.type === "tenant") conditions.push({ tenantId: scope.userId });
	if (scope.type === "managed" && !isAdmin(scope.user))
		conditions.push({
			room: {
				unit: {
					building: {
						property: {
							OR: [{ ownerId: scope.user.id }, { managerId: scope.user.id }],
						},
					},
				},
			},
		});
	if (query.status) conditions.push({ status: query.status });
	if (query.propertyId)
		conditions.push({
			room: { unit: { building: { propertyId: query.propertyId } } },
		});
	if (query.roomId) conditions.push({ roomId: query.roomId });
	if (query.tenantId && scope.type === "managed")
		conditions.push({ tenantId: query.tenantId });
	if (query.from || query.to)
		conditions.push({ startDate: { gte: query.from, lt: query.to } });
	return { AND: conditions };
};

const listLeases = async (
	query: TLeaseQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const where = buildWhere(query, scope);
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		{ id: "asc" },
	] as Prisma.LeaseOrderByWithRelationInput[];
	const [data, total] = await leasePrisma.$transaction([
		leasePrisma.lease.findMany({
			where,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			orderBy,
			select: leaseSelect,
		}),
		leasePrisma.lease.count({ where }),
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

const getMyLeases = async (query: TLeaseQuery, user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can access their leases",
		);
	return listLeases(query, { type: "tenant", userId: user.id });
};

const getManagedLeases = async (query: TLeaseQuery, user: RequestUser) => {
	if (
		!isAdmin(user) &&
		!user.roles.includes(AppRole.OWNER) &&
		!user.roles.includes(AppRole.TENANT)
	)
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to access leases",
		);
	return listLeases(query, { type: "managed", user });
};

const getLeaseById = async (id: string, user: RequestUser) => {
	const lease = await getLeaseForAccess(id);
	assertLeaseAccess(lease, user);
	return toDto(lease);
};

const terminateLease = async (id: string, user: RequestUser) => {
	const lease = await getLeaseForAccess(id);
	assertLeaseAccess(lease, user);
	const property = propertyFromLease(lease);
	if (
		isAdmin(user) ||
		property.ownerId === user.id ||
		property.managerId === user.id
	) {
		const updated = await leasePrisma.lease.updateMany({
			where: { id, deletedAt: null, status: LeaseStatus.ACTIVE },
			data: { status: LeaseStatus.TERMINATED },
		});
		if (updated.count !== 1)
			throw new AppError(
				httpStatus.CONFLICT,
				"Lease has already been processed",
			);
	} else {
		throw new AppError(httpStatus.NOT_FOUND, "Lease not found");
	}
	return getLeaseById(id, user);
};

export const LeaseServices = {
	createLease,
	getMyLeases,
	getManagedLeases,
	getLeaseById,
	terminateLease,
};
