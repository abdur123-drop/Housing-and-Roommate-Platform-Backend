import httpStatus from "http-status";
import {
	Prisma,
	type PrismaClient,
	UnitStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateUnitPayload,
	TUnitQuery,
	TUpdateUnitPayload,
} from "./unit.interface";

let unitPrisma: PrismaClient = prisma;

export const setUnitPrismaForTest = (client: PrismaClient): void => {
	unitPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetUnitPrismaForTest = (): void => {
	unitPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const unitSelect = {
	id: true,
	buildingId: true,
	unitNumber: true,
	floor: true,
	bedrooms: true,
	bathrooms: true,
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
			"An active unit with this number already exists for this building",
		);
	}

	throw error;
};

const listUnits = async (
	buildingId: string,
	query: TUnitQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"building",
		buildingId,
		"access",
		undefined,
		true,
	);

	const where: Prisma.UnitWhereInput = {
		buildingId,
		deletedAt: null,
		building: { deletedAt: null, property: { deletedAt: null } },
	};

	if (query.search) {
		where.unitNumber = { contains: query.search, mode: "insensitive" };
	}

	if (query.status) {
		where.status = query.status;
	}

	const skip = (query.page - 1) * query.limit;
	const [data, total] = await unitPrisma.$transaction([
		unitPrisma.unit.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: unitSelect,
		}),
		unitPrisma.unit.count({ where }),
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

const createUnit = async (
	buildingId: string,
	payload: TCreateUnitPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"building",
		buildingId,
		"access",
		undefined,
		true,
	);

	try {
		return await unitPrisma.unit.create({
			data: {
				...payload,
				buildingId,
				status: payload.status ?? UnitStatus.AVAILABLE,
			},
			select: unitSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const getUnitById = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"unit",
		id,
		"access",
		undefined,
		true,
	);

	const unit = await unitPrisma.unit.findFirst({
		where: {
			id,
			deletedAt: null,
			building: { deletedAt: null, property: { deletedAt: null } },
		},
		select: unitSelect,
	});

	if (!unit) {
		throw new AppError(httpStatus.NOT_FOUND, "Unit not found");
	}

	return unit;
};

const updateUnit = async (
	id: string,
	payload: TUpdateUnitPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"unit",
		id,
		"access",
		undefined,
		true,
	);

	try {
		return await unitPrisma.unit.update({
			where: { id },
			data: payload,
			select: unitSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const deleteUnit = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"unit",
		id,
		"access",
		undefined,
		true,
	);

	return unitPrisma.unit.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: unitSelect,
	});
};

export const UnitServices = {
	createUnit,
	getUnitById,
	listUnits,
	updateUnit,
	deleteUnit,
};
