import httpStatus from "http-status";
import {
	Prisma,
	type PrismaClient,
	PropertyStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
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

	if (query.country) {
		andConditions.push({
			country: { equals: query.country, mode: "insensitive" },
		});
	}

	return { AND: andConditions };
};

const listWithMeta = async (query: TPropertyQuery, ownerId?: string) => {
	const skip = (query.page - 1) * query.limit;
	const where = buildWhere(query, ownerId);

	const [data, total] = await propertyPrisma.$transaction([
		propertyPrisma.property.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: propertySelect,
		}),
		propertyPrisma.property.count({ where }),
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

const createProperty = async (
	payload: TCreatePropertyPayload,
	user: RequestUser,
) => {
	try {
		return await propertyPrisma.property.create({
			data: {
				...payload,
				ownerId: user.id,
				status: payload.status ?? PropertyStatus.DRAFT,
			},
			select: propertySelect,
		});
	} catch (error) {
		return mapPrismaConflict(error);
	}
};

const getProperties = async (query: TPropertyQuery) => listWithMeta(query);

const getMyProperties = async (query: TPropertyQuery, user: RequestUser) =>
	listWithMeta(query, user.id);

const getPropertyById = async (id: string) => {
	const property = await propertyPrisma.property.findFirst({
		where: { id, deletedAt: null, status: PropertyStatus.PUBLISHED },
		select: propertySelect,
	});

	if (!property) {
		throw new AppError(httpStatus.NOT_FOUND, "Property not found");
	}

	return property;
};

const updateProperty = async (
	id: string,
	payload: TUpdatePropertyPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(user, id, "access", true);

	try {
		return await propertyPrisma.property.update({
			where: { id },
			data: payload,
			select: propertySelect,
		});
	} catch (error) {
		return mapPrismaConflict(error);
	}
};

const deleteProperty = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizeProperty(user, id, "owner", true);

	return propertyPrisma.property.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: propertySelect,
	});
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

	return propertyPrisma.property.update({
		where: { id },
		data: { managerId: payload.managerId },
		select: propertySelect,
	});
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
