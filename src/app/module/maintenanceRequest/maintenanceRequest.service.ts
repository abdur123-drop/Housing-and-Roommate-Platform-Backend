import httpStatus from "http-status";
import {
	MaintenancePriority,
	MaintenanceStatus,
	type Prisma,
	type PrismaClient,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateMaintenanceRequestPayload,
	TMaintenanceRequestQuery,
	TUpdateMaintenanceRequestPayload,
} from "./maintenanceRequest.interface";

type MaintenancePrisma = PrismaClient;
let maintenancePrisma: MaintenancePrisma = prisma;

export const setMaintenancePrismaForTest = (
	client: MaintenancePrisma,
): void => {
	maintenancePrisma = client;
};

export const resetMaintenancePrismaForTest = (): void => {
	maintenancePrisma = prisma;
};

const requestSelect = {
	id: true,
	tenantId: true,
	propertyId: true,
	roomId: true,
	title: true,
	description: true,
	priority: true,
	status: true,
	assignedTo: true,
	createdAt: true,
	updatedAt: true,
	resolvedAt: true,
	tenant: { select: { id: true, name: true, avatar: true } },
	property: {
		select: {
			id: true,
			title: true,
			propertyType: true,
			city: true,
			country: true,
		},
	},
	room: {
		select: {
			id: true,
			roomNumber: true,
			name: true,
			unit: {
				select: {
					id: true,
					unitNumber: true,
					building: { select: { id: true, name: true } },
				},
			},
		},
	},
} as const;

type RequestRecord = Prisma.MaintenanceRequestGetPayload<{
	select: typeof requestSelect;
}>;

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);
const isTenant = (user: RequestUser) => user.roles.includes(AppRole.TENANT);
const hasManagementRole = (user: RequestUser) =>
	isAdmin(user) ||
	user.roles.includes(AppRole.OWNER) ||
	user.roles.includes(AppRole.TENANT);

const toDto = (request: RequestRecord) => ({
	id: request.id,
	tenantId: request.tenantId,
	propertyId: request.propertyId,
	roomId: request.roomId,
	title: request.title,
	description: request.description,
	priority: request.priority,
	status: request.status,
	assignedTo: request.assignedTo,
	createdAt: request.createdAt,
	updatedAt: request.updatedAt,
	resolvedAt: request.resolvedAt,
	tenant: request.tenant,
	property: request.property,
	room: request.room,
});

const relationshipWhere = {
	deletedAt: null,
	tenant: { deletedAt: null },
	property: { deletedAt: null },
	room: {
		deletedAt: null,
		unit: {
			deletedAt: null,
			building: { deletedAt: null, property: { deletedAt: null } },
		},
	},
};

const assertManagerAccess = (
	request: RequestRecord & {
		property: { ownerId?: string; managerId?: string | null };
	},
	user: RequestUser,
) => {
	if (
		isAdmin(user) ||
		request.property.ownerId === user.id ||
		request.property.managerId === user.id
	)
		return;
	throw new AppError(httpStatus.NOT_FOUND, "Maintenance request not found");
};

const getRequestForAccess = async (id: string) => {
	const request = await maintenancePrisma.maintenanceRequest.findFirst({
		where: { id, ...relationshipWhere },
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
	if (!request)
		throw new AppError(httpStatus.NOT_FOUND, "Maintenance request not found");
	return request as RequestRecord & {
		property: { ownerId: string; managerId: string | null };
	};
};

const createMaintenanceRequest = async (
	payload: TCreateMaintenanceRequestPayload,
	user: RequestUser,
) => {
	if (!isTenant(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can create maintenance requests",
		);
	const lease = await maintenancePrisma.lease.findFirst({
		where: {
			tenantId: user.id,
			roomId: payload.roomId,
			status: "ACTIVE",
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
		select: {
			roomId: true,
			room: {
				select: {
					unit: { select: { building: { select: { propertyId: true } } } },
				},
			},
		},
	});
	if (!lease)
		throw new AppError(httpStatus.NOT_FOUND, "Active lease for room not found");

	const request = await maintenancePrisma.maintenanceRequest.create({
		data: {
			tenantId: user.id,
			propertyId: lease.room.unit.building.propertyId,
			roomId: lease.roomId,
			title: payload.title,
			description: payload.description,
			priority: payload.priority ?? MaintenancePriority.MEDIUM,
			status: MaintenanceStatus.OPEN,
		},
		select: requestSelect,
	});
	return toDto(request);
};

const buildWhere = (
	query: TMaintenanceRequestQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
): Prisma.MaintenanceRequestWhereInput => {
	const conditions: Prisma.MaintenanceRequestWhereInput[] = [relationshipWhere];
	if (scope.type === "tenant") conditions.push({ tenantId: scope.userId });
	if (scope.type === "managed" && !isAdmin(scope.user))
		conditions.push({
			property: {
				OR: [{ ownerId: scope.user.id }, { managerId: scope.user.id }],
			},
		});
	if (query.status) conditions.push({ status: query.status });
	if (query.priority) conditions.push({ priority: query.priority });
	if (query.search)
		conditions.push({
			OR: [
				{ title: { contains: query.search, mode: "insensitive" } },
				{ description: { contains: query.search, mode: "insensitive" } },
			],
		});
	return { AND: conditions };
};

const listRequests = async (
	query: TMaintenanceRequestQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const where = buildWhere(query, scope);
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		{ id: "asc" },
	] as Prisma.MaintenanceRequestOrderByWithRelationInput[];
	const [data, total] = await maintenancePrisma.$transaction([
		maintenancePrisma.maintenanceRequest.findMany({
			where,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			orderBy,
			select: requestSelect,
		}),
		maintenancePrisma.maintenanceRequest.count({ where }),
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

const getMyRequests = async (
	query: TMaintenanceRequestQuery,
	user: RequestUser,
) => {
	if (!isTenant(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can access their maintenance requests",
		);
	return listRequests(query, { type: "tenant", userId: user.id });
};

const getManagedRequests = async (
	query: TMaintenanceRequestQuery,
	user: RequestUser,
) => {
	if (!hasManagementRole(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to access maintenance requests",
		);
	return listRequests(query, { type: "managed", user });
};

const getRequestById = async (id: string, user: RequestUser) => {
	const request = await getRequestForAccess(id);
	if (
		isAdmin(user) ||
		request.property.ownerId === user.id ||
		request.property.managerId === user.id
	)
		return toDto(request);
	if (request.tenantId !== user.id)
		throw new AppError(httpStatus.NOT_FOUND, "Maintenance request not found");
	return toDto(request);
};

const updateRequest = async (
	id: string,
	payload: TUpdateMaintenanceRequestPayload,
	user: RequestUser,
) => {
	const request = await getRequestForAccess(id);
	const manages =
		isAdmin(user) ||
		request.property.ownerId === user.id ||
		request.property.managerId === user.id;
	if (
		!manages &&
		(request.tenantId !== user.id || request.status !== MaintenanceStatus.OPEN)
	)
		throw new AppError(httpStatus.NOT_FOUND, "Maintenance request not found");
	const updated = await maintenancePrisma.maintenanceRequest.updateMany({
		where: {
			id,
			deletedAt: null,
			...(manages ? {} : { tenantId: user.id, status: MaintenanceStatus.OPEN }),
		},
		data: payload,
	});
	if (updated.count !== 1)
		throw new AppError(
			httpStatus.CONFLICT,
			"Maintenance request changed before update",
		);
	return getRequestById(id, user);
};

const transitionRequest = async (
	id: string,
	action: "start" | "resolve" | "close",
	user: RequestUser,
) => {
	const request = await getRequestForAccess(id);
	assertManagerAccess(request, user);
	const expected =
		action === "start"
			? MaintenanceStatus.OPEN
			: action === "resolve"
				? MaintenanceStatus.IN_PROGRESS
				: MaintenanceStatus.RESOLVED;
	const next =
		action === "start"
			? MaintenanceStatus.IN_PROGRESS
			: action === "resolve"
				? MaintenanceStatus.RESOLVED
				: MaintenanceStatus.CLOSED;
	const updated = await maintenancePrisma.maintenanceRequest.updateMany({
		where: { id, deletedAt: null, status: expected },
		data: {
			status: next,
			resolvedAt: action === "resolve" ? new Date() : undefined,
		},
	});
	if (updated.count !== 1)
		throw new AppError(
			httpStatus.CONFLICT,
			"Maintenance request is not in the required state",
		);
	return getRequestById(id, user);
};

export const MaintenanceRequestServices = {
	createMaintenanceRequest,
	getMyRequests,
	getManagedRequests,
	getRequestById,
	updateRequest,
	transitionRequest,
};
