import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	Prisma,
	PropertyType,
	RoomType,
	ViewingRequestStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { resetAuthorizationPrismaForTest } from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	resetViewingRequestPrismaForTest,
	setViewingRequestPrismaForTest,
	ViewingRequestServices,
} from "./viewingRequest.service";
import { ViewingRequestValidation } from "./viewingRequest.validation";

const tenantA: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "tenant-a@example.com",
	roles: [AppRole.TENANT],
};

const tenantB: RequestUser = {
	id: "22222222-2222-4222-8222-222222222222",
	userId: "22222222-2222-4222-8222-222222222222",
	email: "tenant-b@example.com",
	roles: [AppRole.TENANT],
};

const owner: RequestUser = {
	id: "33333333-3333-4333-8333-333333333333",
	userId: "33333333-3333-4333-8333-333333333333",
	email: "owner@example.com",
	roles: [AppRole.OWNER],
};

const manager: RequestUser = {
	id: "44444444-4444-4444-8444-444444444444",
	userId: "44444444-4444-4444-8444-444444444444",
	email: "manager@example.com",
	roles: [AppRole.TENANT],
};

const admin: RequestUser = {
	id: "55555555-5555-4555-8555-555555555555",
	userId: "55555555-5555-4555-8555-555555555555",
	email: "admin@example.com",
	roles: [AppRole.ADMIN],
};

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roomId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const propertyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestedDate = new Date("2099-10-01T10:00:00.000Z");
const now = new Date("2026-01-01T00:00:00.000Z");

const roomHierarchy = {
	id: roomId,
	unit: {
		building: {
			property: {
				id: propertyId,
			},
		},
	},
};

const requestRecord = {
	id: requestId,
	userId: tenantA.id,
	propertyId,
	roomId,
	requestedDate,
	requestedTime: "10:00",
	message: "I would like to view this room.",
	status: ViewingRequestStatus.PENDING,
	createdAt: now,
	updatedAt: now,
	user: {
		id: tenantA.id,
		name: "Tenant A",
		avatar: null,
	},
	property: {
		id: propertyId,
		title: "Lake View Apartment",
		propertyType: PropertyType.APARTMENT,
		address: "12 Lake Road",
		city: "Dhaka",
		state: null,
		country: "Bangladesh",
		ownerId: owner.id,
		managerId: manager.id,
	},
	room: {
		id: roomId,
		roomNumber: "101",
		name: "Blue room",
		roomType: RoomType.PRIVATE,
		monthlyRent: "15000",
		unit: {
			id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
			unitNumber: "A-1",
			building: {
				id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
				name: "Tower A",
			},
		},
	},
};

const setDb = (db: unknown) => {
	setViewingRequestPrismaForTest(
		db as Parameters<typeof setViewingRequestPrismaForTest>[0],
	);
};

const transaction = async (input: unknown) => {
	if (Array.isArray(input)) return Promise.all(input);
	return (input as (client: unknown) => Promise<unknown>)({});
};

const expectAppError = async (
	fn: () => Promise<unknown>,
	statusCode: number,
) => {
	await assert.rejects(
		fn,
		(error) => error instanceof AppError && error.statusCode === statusCode,
	);
};

afterEach(() => {
	resetViewingRequestPrismaForTest();
	resetAuthorizationPrismaForTest();
});

describe("viewing request creation", () => {
	it("lets an authenticated tenant create a request and derives ownership/property from the room", async () => {
		let createArgs: unknown;
		let availabilityWhere: unknown;

		setDb({
			room: { findFirst: async () => roomHierarchy },
			roomAvailability: {
				findFirst: async (args: { where: unknown }) => {
					availabilityWhere = args.where;
					return { id: "availability" };
				},
			},
			viewingRequest: {
				create: async (args: unknown) => {
					createArgs = args;
					return requestRecord;
				},
			},
		});

		const result = await ViewingRequestServices.createViewingRequest(
			{
				roomId,
				requestedDate,
				requestedTime: "10:00",
				message: "I would like to view this room.",
			},
			tenantA,
		);

		const data = (createArgs as { data: Record<string, unknown> }).data;
		assert.equal(data.userId, tenantA.id);
		assert.equal(data.propertyId, propertyId);
		assert.equal(data.roomId, roomId);
		assert.equal(data.status, ViewingRequestStatus.PENDING);
		assert.ok(JSON.stringify(availabilityWhere).includes("availableFrom"));
		assert.ok(JSON.stringify(availabilityWhere).includes("availableTo"));
		assert.equal(result.id, requestId);
		assert.equal("password" in result.tenant, false);
		assert.equal("ownerId" in result.property, false);
	});

	it("rejects owner creation, invalid rooms, unavailable dates, and duplicate pending requests", async () => {
		await expectAppError(
			() =>
				ViewingRequestServices.createViewingRequest(
					{ roomId, requestedDate },
					owner,
				),
			403,
		);

		await expectAppError(
			() =>
				ViewingRequestServices.createViewingRequest(
					{
						roomId,
						requestedDate: new Date("2000-01-01T00:00:00.000Z"),
					},
					tenantA,
				),
			400,
		);

		setDb({ room: { findFirst: async () => null } });
		await expectAppError(
			() =>
				ViewingRequestServices.createViewingRequest(
					{ roomId, requestedDate },
					tenantA,
				),
			404,
		);

		setDb({
			room: { findFirst: async () => roomHierarchy },
			roomAvailability: { findFirst: async () => null },
		});
		await expectAppError(
			() =>
				ViewingRequestServices.createViewingRequest(
					{ roomId, requestedDate },
					tenantA,
				),
			400,
		);

		setDb({
			room: { findFirst: async () => roomHierarchy },
			roomAvailability: { findFirst: async () => ({ id: "availability" }) },
			viewingRequest: {
				create: async () => {
					throw new Prisma.PrismaClientKnownRequestError("Unique failed", {
						code: "P2002",
						clientVersion: "test",
					});
				},
			},
		});
		await expectAppError(
			() =>
				ViewingRequestServices.createViewingRequest(
					{ roomId, requestedDate },
					tenantA,
				),
			409,
		);
	});

	it("validates create payloads and rejects client-controlled fields", () => {
		assert.equal(
			ViewingRequestValidation.CreateViewingRequestZodSchema.safeParse({
				roomId,
				requestedDate: requestedDate.toISOString(),
				requestedTime: "10:00",
				message: "Hi",
			}).success,
			true,
		);
		assert.equal(
			ViewingRequestValidation.CreateViewingRequestZodSchema.safeParse({
				roomId: "bad",
				requestedDate: "bad-date",
				requestedTime: "25:00",
				message: "",
				userId: tenantB.id,
				propertyId,
				status: ViewingRequestStatus.APPROVED,
			}).success,
			false,
		);
	});
});

describe("viewing request listing and detail", () => {
	it("scopes tenant listing to the authenticated tenant and supports filters/sorting", async () => {
		let findManyArgs: unknown;
		let countArgs: unknown;

		setDb({
			viewingRequest: {
				findMany: async (args: unknown) => {
					findManyArgs = args;
					return [requestRecord];
				},
				count: async (args: unknown) => {
					countArgs = args;
					return 1;
				},
			},
			$transaction: transaction,
		});

		const result = await ViewingRequestServices.getMyViewingRequests(
			{
				page: 2,
				limit: 5,
				status: ViewingRequestStatus.PENDING,
				propertyId,
				roomId,
				from: new Date("2099-10-01T00:00:00.000Z"),
				to: new Date("2099-10-02T00:00:00.000Z"),
				sortBy: "requestedDate",
				sortOrder: "asc",
			},
			tenantA,
		);

		const args = findManyArgs as {
			where: { AND: unknown[] };
			skip: number;
			take: number;
			orderBy: Record<string, string>[];
		};
		assert.equal(args.skip, 5);
		assert.equal(args.take, 5);
		assert.deepEqual(args.orderBy, [{ requestedDate: "asc" }, { id: "asc" }]);
		assert.ok(JSON.stringify(args.where).includes(tenantA.id));
		assert.deepEqual(countArgs, { where: args.where });
		assert.equal(result.meta.totalPage, 1);
	});

	it("authorizes owner, assigned manager, admin, and tenant detail access without leaking unrelated requests", async () => {
		setDb({
			viewingRequest: { findFirst: async () => requestRecord },
		});

		await ViewingRequestServices.getViewingRequestById(requestId, tenantA);
		await ViewingRequestServices.getViewingRequestById(requestId, owner);
		await ViewingRequestServices.getViewingRequestById(requestId, manager);
		await ViewingRequestServices.getViewingRequestById(requestId, admin);

		await expectAppError(
			() => ViewingRequestServices.getViewingRequestById(requestId, tenantB),
			404,
		);
	});

	it("allows owner/manager/admin scoped listings and verifies property access", async () => {
		let authorizedPropertyId = "";

		setDb({
			property: {
				findFirst: async (args: { where: { id: string } }) => {
					authorizedPropertyId = args.where.id;
					return { id: propertyId, ownerId: owner.id, managerId: manager.id };
				},
			},
			viewingRequest: {
				findMany: async () => [requestRecord],
				count: async () => 1,
			},
			$transaction: transaction,
		});

		await ViewingRequestServices.getPropertyViewingRequests(
			propertyId,
			{
				page: 1,
				limit: 10,
				sortBy: "createdAt",
				sortOrder: "desc",
			},
			manager,
		);

		await ViewingRequestServices.getManagedViewingRequests(
			{
				page: 1,
				limit: 10,
				propertyId,
				sortBy: "createdAt",
				sortOrder: "desc",
			},
			owner,
		);

		assert.equal(authorizedPropertyId, propertyId);
	});

	it("validates listing query params", () => {
		assert.equal(
			ViewingRequestValidation.ViewingRequestQueryZodSchema.safeParse({
				page: 0,
				limit: 101,
				status: "BAD",
				propertyId: "bad",
				roomId: "bad",
				from: "2099-12-02T00:00:00.000Z",
				to: "2099-12-01T00:00:00.000Z",
				sortBy: "tenantId",
				sortOrder: "sideways",
			}).success,
			false,
		);
	});
});

describe("viewing request transitions", () => {
	it("allows only owner, assigned manager, or admin to approve/reject pending requests atomically", async () => {
		const statuses: string[] = [];

		setDb({
			viewingRequest: {
				findFirst: async () => ({
					...requestRecord,
					status: statuses.at(-1) ?? ViewingRequestStatus.PENDING,
				}),
				updateMany: async (args: {
					data: { status: ViewingRequestStatus };
				}) => {
					statuses.push(args.data.status);
					return { count: 1 };
				},
			},
			roomAvailability: { findFirst: async () => ({ id: "availability" }) },
		});

		const approved = await ViewingRequestServices.transitionViewingRequest(
			requestId,
			"approve",
			owner,
		);
		assert.equal(approved.status, ViewingRequestStatus.APPROVED);
		assert.equal(statuses.join(","), ViewingRequestStatus.APPROVED);

		setDb({
			viewingRequest: {
				findFirst: async () => ({
					...requestRecord,
					status: ViewingRequestStatus.PENDING,
				}),
				updateMany: async (args: {
					data: { status: ViewingRequestStatus };
				}) => {
					statuses.push(args.data.status);
					return { count: 1 };
				},
			},
		});
		await ViewingRequestServices.transitionViewingRequest(
			requestId,
			"reject",
			manager,
		);
		await ViewingRequestServices.transitionViewingRequest(
			requestId,
			"reject",
			admin,
		);
		assert.deepEqual(statuses.slice(1), [
			ViewingRequestStatus.REJECTED,
			ViewingRequestStatus.REJECTED,
		]);
	});

	it("lets a tenant cancel only their own pending request", async () => {
		let nextStatus: ViewingRequestStatus | undefined;

		setDb({
			viewingRequest: {
				findFirst: async () => requestRecord,
				updateMany: async (args: {
					data: { status: ViewingRequestStatus };
				}) => {
					nextStatus = args.data.status;
					return { count: 1 };
				},
			},
		});

		await ViewingRequestServices.transitionViewingRequest(
			requestId,
			"cancel",
			tenantA,
		);
		assert.equal(nextStatus, ViewingRequestStatus.CANCELLED);

		await expectAppError(
			() =>
				ViewingRequestServices.transitionViewingRequest(
					requestId,
					"cancel",
					tenantB,
				),
			404,
		);
	});

	it("rejects terminal transitions and concurrent processed requests", async () => {
		setDb({
			viewingRequest: {
				findFirst: async () => ({
					...requestRecord,
					status: ViewingRequestStatus.APPROVED,
				}),
			},
		});

		await expectAppError(
			() =>
				ViewingRequestServices.transitionViewingRequest(
					requestId,
					"reject",
					owner,
				),
			409,
		);

		setDb({
			viewingRequest: {
				findFirst: async () => requestRecord,
				updateMany: async () => ({ count: 0 }),
			},
			roomAvailability: { findFirst: async () => ({ id: "availability" }) },
		});

		await expectAppError(
			() =>
				ViewingRequestServices.transitionViewingRequest(
					requestId,
					"approve",
					owner,
				),
			409,
		);
	});
});
