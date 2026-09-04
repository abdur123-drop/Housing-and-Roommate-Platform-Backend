import httpStatus from "http-status";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
	AuthorizationService,
	setAuthorizationPrismaForTest,
} from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TBuildingQuery,
	TCreateBuildingPayload,
	TUpdateBuildingPayload,
} from "./building.interface";

let buildingPrisma: PrismaClient = prisma;

export const setBuildingPrismaForTest = (client: PrismaClient): void => {
	buildingPrisma = client;
	setAuthorizationPrismaForTest(client);
};

export const resetBuildingPrismaForTest = (): void => {
	buildingPrisma = prisma;
	setAuthorizationPrismaForTest(prisma);
};

const buildingSelect = {
	id: true,
	propertyId: true,
	name: true,
	description: true,
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
			"An active building with this name already exists for this property",
		);
	}

	throw error;
};

const listBuildings = async (
	propertyId: string,
	query: TBuildingQuery,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(
		user,
		propertyId,
		"access",
		true,
	);

	const where: Prisma.BuildingWhereInput = {
		propertyId,
		deletedAt: null,
		property: { deletedAt: null },
	};

	if (query.search) {
		where.OR = [
			{ name: { contains: query.search, mode: "insensitive" } },
			{ description: { contains: query.search, mode: "insensitive" } },
		];
	}

	const skip = (query.page - 1) * query.limit;
	const [data, total] = await buildingPrisma.$transaction([
		buildingPrisma.building.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: buildingSelect,
		}),
		buildingPrisma.building.count({ where }),
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

const createBuilding = async (
	propertyId: string,
	payload: TCreateBuildingPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizeProperty(
		user,
		propertyId,
		"access",
		true,
	);

	try {
		return await buildingPrisma.building.create({
			data: { ...payload, propertyId },
			select: buildingSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const getBuildingById = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"building",
		id,
		"access",
		undefined,
		true,
	);

	const building = await buildingPrisma.building.findFirst({
		where: { id, deletedAt: null, property: { deletedAt: null } },
		select: buildingSelect,
	});

	if (!building) {
		throw new AppError(httpStatus.NOT_FOUND, "Building not found");
	}

	return building;
};

const updateBuilding = async (
	id: string,
	payload: TUpdateBuildingPayload,
	user: RequestUser,
) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"building",
		id,
		"access",
		undefined,
		true,
	);

	try {
		return await buildingPrisma.building.update({
			where: { id },
			data: payload,
			select: buildingSelect,
		});
	} catch (error) {
		return mapConflict(error);
	}
};

const deleteBuilding = async (id: string, user: RequestUser) => {
	await AuthorizationService.authorizePropertyResource(
		user,
		"building",
		id,
		"access",
		undefined,
		true,
	);

	return buildingPrisma.building.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: buildingSelect,
	});
};

export const BuildingServices = {
	createBuilding,
	getBuildingById,
	listBuildings,
	updateBuilding,
	deleteBuilding,
};
