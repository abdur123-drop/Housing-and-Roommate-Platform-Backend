import type { NextFunction, Request, RequestHandler, Response } from "express";
import httpStatus from "http-status";
import { z } from "zod";
import { AppRole } from "../constants/roles";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import type { RequestUser } from "./checkAuth";

const uuidSchema = z.uuid();
let authorizationPrisma = prisma;

export const setAuthorizationPrismaForTest = (client: typeof prisma): void => {
	authorizationPrisma = client;
};

export const resetAuthorizationPrismaForTest = (): void => {
	authorizationPrisma = prisma;
};

export type PropertyAuthorizationMode = "owner" | "manager" | "access";
type PropertyRelationship = "admin" | "owner" | "manager";

type PropertyAccessRecord = {
	id: string;
	ownerId: string;
	managerId: string | null;
};

export type TenantResource =
	| "roommateProfile"
	| "userPreference"
	| "viewingRequest"
	| "application"
	| "lease"
	| "rentPayment"
	| "utilityBillSplit"
	| "maintenanceRequest";

export type PropertyResource =
	| "property"
	| "building"
	| "unit"
	| "room"
	| "roomAvailability"
	| "maintenanceRequest";

type ResourceIdParamOptions = {
	idParam?: string;
	propertyIdParam?: string;
	admin?: boolean;
};

type TenantResourceOptions = {
	idParam?: string;
	admin?: boolean;
};

const AUTH_REQUIRED_MESSAGE =
	"You are not logged in. Please log in to access this resource.";
const FORBIDDEN_MESSAGE = "You are not authorized to access this resource";
const NOT_FOUND_MESSAGE = "Resource not found";

const requireUser = (req: Request): RequestUser => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, AUTH_REQUIRED_MESSAGE);
	}

	return req.user;
};

const getUuidParam = (req: Request, name: string): string => {
	const rawValue = req.params[name];
	const result = uuidSchema.safeParse(rawValue);

	if (!result.success) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid route parameter", [
			{ path: name, message: `${name} must be a valid UUID` },
		]);
	}

	return result.data;
};

const isAdmin = (user: RequestUser): boolean =>
	user.roles.includes(AppRole.ADMIN);

const assertPropertyPermission = (
	user: RequestUser,
	property: PropertyAccessRecord,
	mode: PropertyAuthorizationMode,
	allowAdmin: boolean,
): PropertyRelationship => {
	if (allowAdmin && isAdmin(user)) {
		return "admin";
	}

	if (property.ownerId === user.id) {
		return "owner";
	}

	if (mode !== "owner" && property.managerId === user.id) {
		return "manager";
	}

	throw new AppError(httpStatus.FORBIDDEN, FORBIDDEN_MESSAGE);
};

const normalizeProperty = (
	property: PropertyAccessRecord & { deletedAt?: Date | null },
): PropertyAccessRecord | null => {
	if (property.deletedAt) return null;

	return {
		id: property.id,
		ownerId: property.ownerId,
		managerId: property.managerId,
	};
};

const getPropertyRecord = async (
	propertyId: string,
): Promise<PropertyAccessRecord | null> => {
	const property = await authorizationPrisma.property.findFirst({
		where: { id: propertyId, deletedAt: null },
		select: { id: true, ownerId: true, managerId: true },
	});

	return property;
};

const getPropertyFromResource = async (
	resource: PropertyResource,
	resourceId: string,
): Promise<PropertyAccessRecord | null> => {
	if (resource === "property") {
		return getPropertyRecord(resourceId);
	}

	if (resource === "building") {
		const building = await authorizationPrisma.building.findFirst({
			where: { id: resourceId, deletedAt: null },
			select: {
				property: {
					select: {
						id: true,
						ownerId: true,
						managerId: true,
						deletedAt: true,
					},
				},
			},
		});

		return building ? normalizeProperty(building.property) : null;
	}

	if (resource === "unit") {
		const unit = await authorizationPrisma.unit.findFirst({
			where: { id: resourceId, deletedAt: null },
			select: {
				building: {
					select: {
						deletedAt: true,
						property: {
							select: {
								id: true,
								ownerId: true,
								managerId: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		if (!unit || unit.building.deletedAt) return null;
		return normalizeProperty(unit.building.property);
	}

	if (resource === "room") {
		const room = await authorizationPrisma.room.findFirst({
			where: { id: resourceId, deletedAt: null },
			select: {
				unit: {
					select: {
						deletedAt: true,
						building: {
							select: {
								deletedAt: true,
								property: {
									select: {
										id: true,
										ownerId: true,
										managerId: true,
										deletedAt: true,
									},
								},
							},
						},
					},
				},
			},
		});

		if (!room || room.unit.deletedAt || room.unit.building.deletedAt)
			return null;
		return normalizeProperty(room.unit.building.property);
	}

	if (resource === "roomAvailability") {
		const availability = await authorizationPrisma.roomAvailability.findFirst({
			where: { id: resourceId, deletedAt: null },
			select: {
				room: {
					select: {
						deletedAt: true,
						unit: {
							select: {
								deletedAt: true,
								building: {
									select: {
										deletedAt: true,
										property: {
											select: {
												id: true,
												ownerId: true,
												managerId: true,
												deletedAt: true,
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

		if (
			!availability ||
			availability.room.deletedAt ||
			availability.room.unit.deletedAt ||
			availability.room.unit.building.deletedAt
		) {
			return null;
		}

		return normalizeProperty(availability.room.unit.building.property);
	}

	const maintenanceRequest =
		await authorizationPrisma.maintenanceRequest.findFirst({
			where: { id: resourceId, deletedAt: null },
			select: {
				property: {
					select: {
						id: true,
						ownerId: true,
						managerId: true,
						deletedAt: true,
					},
				},
			},
		});

	return maintenanceRequest
		? normalizeProperty(maintenanceRequest.property)
		: null;
};

const tenantResourceBelongsToUser = async (
	resource: TenantResource,
	resourceId: string,
	userId: string,
): Promise<boolean> => {
	if (resource === "roommateProfile") {
		const record = await authorizationPrisma.roommateProfile.findFirst({
			where: { id: resourceId, userId, deletedAt: null },
			select: { id: true },
		});
		return Boolean(record);
	}

	if (resource === "userPreference") {
		const record = await authorizationPrisma.userPreference.findFirst({
			where: {
				userId,
				preferenceId: resourceId,
				preference: { deletedAt: null },
			},
			select: { userId: true },
		});
		return Boolean(record);
	}

	if (resource === "viewingRequest") {
		const record = await authorizationPrisma.viewingRequest.findFirst({
			where: { id: resourceId, userId, deletedAt: null },
			select: { id: true },
		});
		return Boolean(record);
	}

	if (resource === "application") {
		const record = await authorizationPrisma.application.findFirst({
			where: { id: resourceId, userId, deletedAt: null },
			select: { id: true },
		});
		return Boolean(record);
	}

	if (resource === "lease") {
		const record = await authorizationPrisma.lease.findFirst({
			where: { id: resourceId, tenantId: userId, deletedAt: null },
			select: { id: true },
		});
		return Boolean(record);
	}

	if (resource === "rentPayment") {
		const record = await authorizationPrisma.rentPayment.findFirst({
			where: { id: resourceId, tenantId: userId },
			select: { id: true },
		});
		return Boolean(record);
	}

	if (resource === "utilityBillSplit") {
		const record = await authorizationPrisma.utilityBillSplit.findFirst({
			where: { id: resourceId, tenantId: userId },
			select: { id: true },
		});
		return Boolean(record);
	}

	const record = await authorizationPrisma.maintenanceRequest.findFirst({
		where: { id: resourceId, tenantId: userId, deletedAt: null },
		select: { id: true },
	});
	return Boolean(record);
};

const authorizeProperty = async (
	user: RequestUser,
	propertyId: string,
	mode: PropertyAuthorizationMode,
	allowAdmin = true,
): Promise<PropertyRelationship> => {
	const property = await getPropertyRecord(propertyId);

	if (!property) {
		throw new AppError(httpStatus.NOT_FOUND, NOT_FOUND_MESSAGE);
	}

	return assertPropertyPermission(user, property, mode, allowAdmin);
};

const authorizePropertyResource = async (
	user: RequestUser,
	resource: PropertyResource,
	resourceId: string,
	mode: PropertyAuthorizationMode,
	expectedPropertyId?: string,
	allowAdmin = true,
): Promise<PropertyRelationship> => {
	const property = await getPropertyFromResource(resource, resourceId);

	if (!property || (expectedPropertyId && property.id !== expectedPropertyId)) {
		throw new AppError(httpStatus.NOT_FOUND, NOT_FOUND_MESSAGE);
	}

	return assertPropertyPermission(user, property, mode, allowAdmin);
};

const authorizeTenantResource = async (
	user: RequestUser,
	resource: TenantResource,
	resourceId: string,
	allowAdmin = false,
): Promise<void> => {
	if (allowAdmin && isAdmin(user)) return;

	const belongsToUser = await tenantResourceBelongsToUser(
		resource,
		resourceId,
		user.id,
	);

	if (!belongsToUser) {
		throw new AppError(httpStatus.NOT_FOUND, NOT_FOUND_MESSAGE);
	}
};

const propertyMiddleware =
	(mode: PropertyAuthorizationMode, options: ResourceIdParamOptions = {}) =>
	(req: Request, _res: Response, next: NextFunction) => {
		const handler = async () => {
			const user = requireUser(req);
			const propertyId = getUuidParam(req, options.idParam ?? "propertyId");

			await authorizeProperty(user, propertyId, mode, options.admin ?? true);
			next();
		};

		void handler().catch(next);
	};

export const requirePropertyOwner = (
	options?: ResourceIdParamOptions,
): RequestHandler => propertyMiddleware("owner", options);

export const requirePropertyManager = (
	options?: ResourceIdParamOptions,
): RequestHandler => propertyMiddleware("manager", options);

export const requirePropertyAccess = (
	options?: ResourceIdParamOptions,
): RequestHandler => propertyMiddleware("access", options);

export const requirePropertyResourceAccess = (
	resource: PropertyResource,
	mode: PropertyAuthorizationMode,
	options: ResourceIdParamOptions = {},
): RequestHandler =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		const user = requireUser(req);
		const resourceId = getUuidParam(req, options.idParam ?? "id");
		const propertyId = options.propertyIdParam
			? getUuidParam(req, options.propertyIdParam)
			: undefined;

		await authorizePropertyResource(
			user,
			resource,
			resourceId,
			mode,
			propertyId,
			options.admin ?? true,
		);

		next();
	});

export const requireTenantResource = (
	resource: TenantResource,
	options: TenantResourceOptions = {},
): RequestHandler =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		const user = requireUser(req);
		const resourceId = getUuidParam(req, options.idParam ?? "id");

		await authorizeTenantResource(
			user,
			resource,
			resourceId,
			options.admin ?? false,
		);

		next();
	});

export const AuthorizationService = {
	authorizeProperty,
	authorizePropertyResource,
	authorizeTenantResource,
};
