import httpStatus from "http-status";
import {
	AvailabilityStatus,
	Prisma,
	type PrismaClient,
	PropertyStatus,
	RoomStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
	getJsonCache,
	getPropertyCacheVersion,
	PROPERTY_CACHE_TTL_SECONDS,
	invalidatePropertyCache,
	redisKeys,
setJsonCache,
} from "../../lib/cache";
import {
	AuditAction,
	AuditResourceType,
	createAuditLogIfAvailable,
} from "../../utils/audit";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TAssignPropertyManagerPayload,
	TCreatePropertyPayload,
	TPropertyQuery,
	TUpdatePropertyPayload,
} from "./property.interface";

let propertyPrisma: PrismaClient = prisma;

export const setPropertyPrismaForTest = (client: PrismaClient): void => {
	propertyPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetPropertyPrismaForTest = (): void => {
	propertyPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const propertySelect = {
	id: true,
	ownerId: true,
	managerId: true,
	title: true,
	description: true,
	propertyType: true,
	address: true,
	city: true,
	state: true,
	country: true,
	zipCode: true,
	latitude: true,
	longitude: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} as const;

const publicPropertySelect = {
	id: true,
	title: true,
	description: true,
	propertyType: true,
	address: true,
	city: true,
	state: true,
	country: true,
	zipCode: true,
	latitude: true,
	longitude: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	buildings: {
		where: { deletedAt: null },
		select: {
			units: {
				where: { deletedAt: null },
				select: {
					rooms: {
						where: { deletedAt: null, status: RoomStatus.AVAILABLE },
						select: {
							id: true,
							monthlyRent: true,
							availability: {
								where: {
									deletedAt: null,
									status: AvailabilityStatus.AVAILABLE,
								},
								select: { id: true, availableFrom: true, availableTo: true },
							},
						},
					},
				},
			},
		},
	},
} as const;

type PublicPropertyRecord = Prisma.PropertyGetPayload<{
	select: typeof publicPropertySelect;
}>;

const mapPrismaConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An active property with this title already exists for this owner",
		);
	}

	throw error;
};

const buildWhere = (
	query: TPropertyQuery,
	ownerId?: string,
): Prisma.PropertyWhereInput => {
	const andConditions: Prisma.PropertyWhereInput[] = [
		{ deletedAt: null },
		{ status: PropertyStatus.PUBLISHED },
	];

	if (ownerId) {
		andConditions.push({ ownerId });
		andConditions.splice(1, 1);
	}

	if (query.search) {
		andConditions.push({
			OR: [
				{ title: { contains: query.search, mode: "insensitive" } },
				{ description: { contains: query.search, mode: "insensitive" } },
				{ address: { contains: query.search, mode: "insensitive" } },
				{ city: { contains: query.search, mode: "insensitive" } },
				{ state: { contains: query.search, mode: "insensitive" } },
				{ country: { contains: query.search, mode: "insensitive" } },
				{ zipCode: { contains: query.search, mode: "insensitive" } },
			],
		});
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.propertyType) {
		andConditions.push({ propertyType: query.propertyType });
	}

	if (query.city) {
		andConditions.push({ city: { equals: query.city, mode: "insensitive" } });
	}

	if (query.state) {
		andConditions.push({
			state: { equals: query.state, mode: "insensitive" },
		});
	}

	if (query.country) {
		andConditions.push({
			country: { equals: query.country, mode: "insensitive" },
		});
	}

	if (
		query.minPrice ||
		query.maxPrice ||
		query.availableFrom ||
		query.availableTo
	) {
		andConditions.push({
			buildings: {
				some: {
					deletedAt: null,
					units: {
						some: {
							deletedAt: null,
							rooms: {
								some: buildRoomSearchWhere(query),
							},
						},
					},
				},
			},
		});
	}

	return { AND: andConditions };
};

const buildRoomSearchWhere = (
	query: Pick<
		TPropertyQuery,
		"minPrice" | "maxPrice" | "availableFrom" | "availableTo"
	>,
): Prisma.RoomWhereInput => {
	const where: Prisma.RoomWhereInput = {
		deletedAt: null,
		status: RoomStatus.AVAILABLE,
	};

	if (query.minPrice || query.maxPrice) {
		where.monthlyRent = {
			gte: query.minPrice,
			lte: query.maxPrice,
		};
	}

	if (query.availableFrom || query.availableTo) {
		where.availability = {
			some: {
				deletedAt: null,
				status: AvailabilityStatus.AVAILABLE,
				availableFrom: query.availableTo
					? { lt: query.availableTo }
					: undefined,
				OR: query.availableFrom
					? [
							{ availableTo: null },
							{ availableTo: { gt: query.availableFrom } },
						]
					: undefined,
			},
		};
	}

	return where;
};

const intersectsRequestedAvailability = (
	availability: PublicPropertyRecord["buildings"][number]["units"][number]["rooms"][number]["availability"][number],
	query: Pick<TPropertyQuery, "availableFrom" | "availableTo">,
) => {
	if (!query.availableFrom && !query.availableTo) return true;
	if (query.availableTo && availability.availableFrom >= query.availableTo) {
		return false;
	}

	if (query.availableFrom && availability.availableTo) {
		return availability.availableTo > query.availableFrom;
	}

	return true;
};

const toNumber = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	const numberValue = Number(value.toString());
	return Number.isFinite(numberValue) ? numberValue : null;
};

const toPublicPropertyDto = (
	property: PublicPropertyRecord,
	query: Pick<TPropertyQuery, "availableFrom" | "availableTo"> = {},
) => {
	const rooms = property.buildings.flatMap((building) =>
		building.units.flatMap((unit) => unit.rooms),
	);
	const activeAvailableRooms = rooms.filter((room) =>
		query.availableFrom || query.availableTo
			? room.availability.some((availability) =>
					intersectsRequestedAvailability(availability, query),
				)
			: true,
	);
	const rents = activeAvailableRooms
		.map((room) => toNumber(room.monthlyRent))
		.filter((rent): rent is number => rent !== null);

	return {
		id: property.id,
		title: property.title,
		description: property.description,
		propertyType: property.propertyType,
		address: property.address,
		city: property.city,
		state: property.state,
		country: property.country,
		zipCode: property.zipCode,
		latitude: toNumber(property.latitude),
		longitude: toNumber(property.longitude),
		status: property.status,
		minMonthlyRent: rents.length ? Math.min(...rents) : null,
		maxMonthlyRent: rents.length ? Math.max(...rents) : null,
		availableRoomCount: activeAvailableRooms.length,
		createdAt: property.createdAt,
		updatedAt: property.updatedAt,
	};
};

const listWithMeta = async (
	query: TPropertyQuery,
	ownerId?: string,
	isPublicSearch = false,
) => {
	const skip = (query.page - 1) * query.limit;
	const where = buildWhere(query, ownerId);
	const orderBy = [{ [query.sortBy]: query.sortOrder }, { id: "asc" }] as
		| Prisma.PropertyOrderByWithRelationInput
		| Prisma.PropertyOrderByWithRelationInput[];

	const [data, total] = await propertyPrisma.$transaction([
		propertyPrisma.property.findMany({
			where,
			skip,
			take: query.limit,
			orderBy,
			select: isPublicSearch ? publicPropertySelect : propertySelect,
		}),
		propertyPrisma.property.count({ where }),
	]);

	return {
		data: isPublicSearch
			? (data as PublicPropertyRecord[]).map((property) =>
					toPublicPropertyDto(property, query),
				)
			: data,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const createProperty = async (
	payload: TCreatePropertyPayload,
	user: RequestUser,
) => {
	try {
		const created = await propertyPrisma.property.create({
			data: {
				...payload,
				ownerId: user.id,
				status: payload.status ?? PropertyStatus.DRAFT,
			},
			select: propertySelect,
		});
		await invalidatePropertyCache();
		await createAuditLogIfAvailable(propertyPrisma, {
			actorUserId: user.id,
			action: AuditAction.PROPERTY_CREATED,
			entityType: AuditResourceType.PROPERTY,
			entityId: created.id,
		});
		return created;
	} catch (error) {
		return mapPrismaConflict(error);
	}
};

const getProperties = async (query: TPropertyQuery) => {
	const canonicalQuery = JSON.stringify(query);
	const version = await getPropertyCacheVersion();
	const key = redisKeys.propertySearch(version, canonicalQuery);
	const cached = await getJsonCache<Awaited<ReturnType<typeof listWithMeta>>>(key);
	if (cached) return cached;
	const result = await listWithMeta(query, undefined, true);
	await setJsonCache(key, result, PROPERTY_CACHE_TTL_SECONDS);
	return result;
};

const getMyProperties = async (query: TPropertyQuery, user: RequestUser) =>
	listWithMeta(query, user.id);

const getPropertyById = async (id: string) => {
	const property = await propertyPrisma.property.findFirst({
		where: { id, deletedAt: null, status: PropertyStatus.PUBLISHED },
		select: publicPropertySelect,
	});

	if (!property) {
		throw new AppError(httpStatus.NOT_FOUND, "Property not found");
	}

	return toPublicPropertyDto(property as PublicPropertyRecord);
};

const updateProperty = async (
	id: string,
	payload: TUpdatePropertyPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(user, id, "access", true);

	try {
		const updated = await propertyPrisma.property.update({
			where: { id },
			data: payload,
			select: propertySelect,
		});
		await invalidatePropertyCache();
		await createAuditLogIfAvailable(propertyPrisma, {
			actorUserId: user.id,
			action: AuditAction.PROPERTY_UPDATED,
			entityType: AuditResourceType.PROPERTY,
			entityId: updated.id,
		});
		return updated;
	} catch (error) {
		return mapPrismaConflict(error);
	}
};

const deleteProperty = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizeProperty(user, id, "owner", true);

	const deleted = await propertyPrisma.property.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: propertySelect,
	});
	await invalidatePropertyCache();
	await createAuditLogIfAvailable(propertyPrisma, {
		actorUserId: user.id,
		action: AuditAction.PROPERTY_DELETED,
		entityType: AuditResourceType.PROPERTY,
		entityId: deleted.id,
	});
	return deleted;
};

const assignManager = async (
	id: string,
	payload: TAssignPropertyManagerPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(user, id, "owner", true);

	if (payload.managerId) {
		const manager = await propertyPrisma.user.findFirst({
			where: { id: payload.managerId, deletedAt: null },
			select: { id: true },
		});

		if (!manager) {
			throw new AppError(httpStatus.NOT_FOUND, "Manager user not found");
		}
	}

	const updated = await propertyPrisma.property.update({
		where: { id },
		data: { managerId: payload.managerId },
		select: propertySelect,
	});
	await invalidatePropertyCache();
	await createAuditLogIfAvailable(propertyPrisma, {
		actorUserId: user.id,
		action: payload.managerId
			? AuditAction.PROPERTY_MANAGER_ASSIGNED
			: AuditAction.PROPERTY_MANAGER_REMOVED,
		entityType: AuditResourceType.PROPERTY,
		entityId: updated.id,
		metadata: { managerId: payload.managerId },
	});
	return updated;
};

export const PropertyServices = {
	createProperty,
	getProperties,
	getMyProperties,
	getPropertyById,
	updateProperty,
	deleteProperty,
	assignManager,
};
