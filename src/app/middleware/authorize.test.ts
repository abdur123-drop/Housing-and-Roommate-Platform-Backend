import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppRole } from "../constants/roles";
import type { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { jwtUtils } from "../utils/jwt";
import {
	AuthorizationService,
	requirePropertyResourceAccess,
	resetAuthorizationPrismaForTest,
	setAuthorizationPrismaForTest,
	type TenantResource,
} from "./authorize";
import {
	auth,
	type RequestUser,
	resetAuthPrismaForTest,
	setAuthPrismaForTest,
} from "./checkAuth";

const ownerUser: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "owner@example.com",
	roles: [AppRole.OWNER],
};

const tenantUser: RequestUser = {
	id: "22222222-2222-4222-8222-222222222222",
	userId: "22222222-2222-4222-8222-222222222222",
	email: "tenant@example.com",
	roles: [AppRole.TENANT],
};

const adminUser: RequestUser = {
	id: "33333333-3333-4333-8333-333333333333",
	userId: "33333333-3333-4333-8333-333333333333",
	email: "admin@example.com",
	roles: [AppRole.ADMIN],
};

const managerUser: RequestUser = {
	id: "44444444-4444-4444-8444-444444444444",
	userId: "44444444-4444-4444-8444-444444444444",
	email: "manager@example.com",
	roles: [AppRole.OWNER],
};

const propertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherPropertyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const roomId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const expectAppError = async (
	fn: () => Promise<unknown>,
	statusCode: number,
) => {
	await assert.rejects(
		fn,
		(error) => error instanceof AppError && error.statusCode === statusCode,
	);
};

const runMiddleware = (handler: RequestHandler, req: Partial<Request>) =>
	new Promise<void>((resolve, reject) => {
		handler(
			req as Request,
			{} as Response,
			((error?: unknown) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			}) as NextFunction,
		);
	});

afterEach(() => {
	mock.restoreAll();
	resetAuthPrismaForTest();
	resetAuthorizationPrismaForTest();
});

const setDb = (db: unknown) => {
	setAuthPrismaForTest(db as typeof prisma);
	setAuthorizationPrismaForTest(db as typeof prisma);
};

describe("role authorization", () => {
	it("allows a user with the required role", async () => {
		mock.method(jwtUtils, "verifyToken", () => ({
			success: true,
			data: { userId: ownerUser.id, type: "access" },
		}));
		setDb({
			user: {
				findFirst: async () => ({
					id: ownerUser.id,
					email: ownerUser.email,
					userRoles: [{ role: { name: AppRole.OWNER } }],
				}),
			},
		});

		const req: Partial<Request> & { user?: RequestUser } = {
			headers: { authorization: "Bearer valid-token" },
		};

		await runMiddleware(auth(AppRole.OWNER), req);

		assert.deepEqual(req.user, ownerUser);
	});

	it("rejects a valid user with the wrong role", async () => {
		mock.method(jwtUtils, "verifyToken", () => ({
			success: true,
			data: { userId: tenantUser.id, type: "access" },
		}));
		setDb({
			user: {
				findFirst: async () => ({
					id: tenantUser.id,
					email: tenantUser.email,
					userRoles: [{ role: { name: AppRole.TENANT } }],
				}),
			},
		});

		await expectAppError(
			() =>
				runMiddleware(auth(AppRole.OWNER), {
					headers: { authorization: "Bearer valid-token" },
				}),
			403,
		);
	});

	it("returns 401 when authentication is missing or invalid", async () => {
		await expectAppError(() => runMiddleware(auth(), { headers: {} }), 401);

		mock.method(jwtUtils, "verifyToken", () => ({
			success: false,
			error: "Invalid authentication token.",
			expired: false,
		}));

		await expectAppError(
			() =>
				runMiddleware(auth(), {
					headers: { authorization: "Bearer invalid-token" },
				}),
			401,
		);
	});

	it("does not authenticate soft-deleted users", async () => {
		mock.method(jwtUtils, "verifyToken", () => ({
			success: true,
			data: { userId: ownerUser.id, type: "access" },
		}));
		setDb({ user: { findFirst: async () => null } });

		await expectAppError(
			() =>
				runMiddleware(auth(), {
					headers: { authorization: "Bearer valid-token" },
				}),
			401,
		);
	});
});

describe("property authorization", () => {
	it("allows an owner to access their own property", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerUser.id,
					managerId: null,
				}),
			},
		});

		const relationship = await AuthorizationService.authorizeProperty(
			ownerUser,
			propertyId,
			"owner",
		);

		assert.equal(relationship, "owner");
	});

	it("denies an owner access to another owner's property", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: "55555555-5555-4555-8555-555555555555",
					managerId: null,
				}),
			},
		});

		await expectAppError(
			() =>
				AuthorizationService.authorizeProperty(ownerUser, propertyId, "owner"),
			403,
		);
	});

	it("allows admin access only when the helper opts in to admin", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerUser.id,
					managerId: null,
				}),
			},
		});

		const allowed = await AuthorizationService.authorizeProperty(
			adminUser,
			propertyId,
			"owner",
			true,
		);

		assert.equal(allowed, "admin");

		await expectAppError(
			() =>
				AuthorizationService.authorizeProperty(
					adminUser,
					propertyId,
					"owner",
					false,
				),
			403,
		);
	});

	it("allows the assigned manager for manager-level access only", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerUser.id,
					managerId: managerUser.id,
				}),
			},
		});

		const managerRelationship = await AuthorizationService.authorizeProperty(
			managerUser,
			propertyId,
			"manager",
		);

		assert.equal(managerRelationship, "manager");

		await expectAppError(
			() =>
				AuthorizationService.authorizeProperty(
					managerUser,
					propertyId,
					"owner",
				),
			403,
		);
	});

	it("treats missing or soft-deleted properties as inaccessible", async () => {
		setDb({ property: { findFirst: async () => null } });

		await expectAppError(
			() =>
				AuthorizationService.authorizeProperty(ownerUser, propertyId, "access"),
			404,
		);
	});
});

describe("tenant and nested resource authorization", () => {
	it("denies tenant access to another tenant's resource ID", async () => {
		setDb({ roommateProfile: { findFirst: async () => null } });

		await expectAppError(
			() =>
				AuthorizationService.authorizeTenantResource(
					tenantUser,
					"roommateProfile" satisfies TenantResource,
					"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				),
			404,
		);
	});

	it("allows tenant access when the resource is scoped to the authenticated user", async () => {
		setDb({ lease: { findFirst: async () => ({ id: roomId }) } });

		await AuthorizationService.authorizeTenantResource(
			tenantUser,
			"lease",
			roomId,
		);
	});

	it("denies nested room access when the room belongs to a different property", async () => {
		setDb({
			room: {
				findFirst: async () => ({
					unit: {
						deletedAt: null,
						building: {
							deletedAt: null,
							property: {
								id: otherPropertyId,
								ownerId: ownerUser.id,
								managerId: null,
								deletedAt: null,
							},
						},
					},
				}),
			},
		});

		await expectAppError(
			() =>
				AuthorizationService.authorizePropertyResource(
					ownerUser,
					"room",
					roomId,
					"access",
					propertyId,
				),
			404,
		);
	});

	it("allows nested room access when property and room hierarchy match", async () => {
		setDb({
			room: {
				findFirst: async () => ({
					unit: {
						deletedAt: null,
						building: {
							deletedAt: null,
							property: {
								id: propertyId,
								ownerId: ownerUser.id,
								managerId: null,
								deletedAt: null,
							},
						},
					},
				}),
			},
		});

		const relationship = await AuthorizationService.authorizePropertyResource(
			ownerUser,
			"room",
			roomId,
			"access",
			propertyId,
		);

		assert.equal(relationship, "owner");
	});

	it("validates UUID route parameters before resource lookup", async () => {
		const handler = requirePropertyResourceAccess("room", "access", {
			idParam: "roomId",
			propertyIdParam: "propertyId",
		});

		await expectAppError(
			() =>
				runMiddleware(handler, {
					user: ownerUser,
					params: { propertyId, roomId: "not-a-uuid" },
				}),
			400,
		);
	});
});
