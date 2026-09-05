import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	AvailabilityStatus,
	Prisma,
	PropertyStatus,
	PropertyType,
	RoomStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	PropertyServices,
	resetPropertyPrismaForTest,
	setPropertyPrismaForTest,
} from "./property.service";
import { PropertyValidation } from "./property.validation";

const ownerA: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "owner-a@example.com",
	roles: [AppRole.OWNER],
};

const ownerB: RequestUser = {
	id: "22222222-2222-4222-8222-222222222222",
	userId: "22222222-2222-4222-8222-222222222222",
	email: "owner-b@example.com",
	roles: [AppRole.OWNER],
};

const tenant: RequestUser = {
	id: "33333333-3333-4333-8333-333333333333",
	userId: "33333333-3333-4333-8333-333333333333",
	email: "tenant@example.com",
	roles: [AppRole.TENANT],
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

const propertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const managerId = manager.id;

const createPayload = {
	title: "Lake View Apartment",
	description: "Bright two-bedroom near the park",
	propertyType: PropertyType.APARTMENT,
	address: "12 Lake Road",
	city: "Dhaka",
	country: "Bangladesh",
	status: PropertyStatus.PUBLISHED,
};

const propertyRecord = {
	id: propertyId,
	ownerId: ownerA.id,
	managerId: null,
	...createPayload,
	state: null,
	zipCode: null,
	latitude: null,
	longitude: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const publicPropertyRecord = {
	...propertyRecord,
	buildings: [
		{
			units: [
				{
					rooms: [
						{
							id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
							monthlyRent: "15000",
							status: RoomStatus.AVAILABLE,
							availability: [
								{
									id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
									availableFrom: new Date("2026-10-01T00:00:00.000Z"),
									availableTo: new Date("2026-11-01T00:00:00.000Z"),
									status: AvailabilityStatus.AVAILABLE,
								},
							],
						},
					],
				},
			],
		},
	],
};

const validQuery = {
	page: 1,
	limit: 10,
	sortBy: "createdAt" as const,
	sortOrder: "desc" as const,
};

const setDb = (db: unknown) => {
	setPropertyPrismaForTest(
		db as Parameters<typeof setPropertyPrismaForTest>[0],
	);
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
	resetPropertyPrismaForTest();
});

describe("property service authorization", () => {
	it("creates a property for the authenticated owner and ignores client ownership", async () => {
		let createArgs: unknown;

		setDb({
			property: {
				create: async (args: unknown) => {
					createArgs = args;
					return propertyRecord;
				},
			},
		});

		const result = await PropertyServices.createProperty(
			{ ...createPayload, ownerId: ownerB.id } as typeof createPayload,
			ownerA,
		);

		assert.ok(result);
		assert.equal(result.id, propertyId);
		assert.equal(
			(createArgs as { data: { ownerId: string } }).data.ownerId,
			ownerA.id,
		);
	});

	it("allows owner, assigned manager, and admin to update when explicitly permitted", async () => {
		const updated = { ...propertyRecord, title: "Updated title" };
		let updateCount = 0;

		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerA.id,
					managerId,
				}),
				update: async () => {
					updateCount += 1;
					return updated;
				},
			},
		});

		await PropertyServices.updateProperty(
			propertyId,
			{ title: "Updated title" },
			ownerA,
		);
		await PropertyServices.updateProperty(
			propertyId,
			{ title: "Updated title" },
			manager,
		);
		await PropertyServices.updateProperty(
			propertyId,
			{ title: "Updated title" },
			admin,
		);

		assert.equal(updateCount, 3);
	});

	it("denies tenants and other owners from updating another owner's property", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerA.id,
					managerId: null,
				}),
			},
		});

		await expectAppError(
			() =>
				PropertyServices.updateProperty(propertyId, { title: "Nope" }, tenant),
			403,
		);
		await expectAppError(
			() =>
				PropertyServices.updateProperty(propertyId, { title: "Nope" }, ownerB),
			403,
		);
	});

	it("allows owner/admin soft delete and denies non-owners", async () => {
		let deletedAt: Date | undefined;

		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerA.id,
					managerId: null,
				}),
				update: async (args: { data: { deletedAt: Date } }) => {
					deletedAt = args.data.deletedAt;
					return { ...propertyRecord, deletedAt };
				},
			},
		});

		await PropertyServices.deleteProperty(propertyId, ownerA);
		assert.ok(deletedAt instanceof Date);

		await expectAppError(
			() => PropertyServices.deleteProperty(propertyId, ownerB),
			403,
		);
	});

	it("does not update or delete soft-deleted properties normally", async () => {
		setDb({ property: { findFirst: async () => null } });

		await expectAppError(
			() =>
				PropertyServices.updateProperty(
					propertyId,
					{ title: "Hidden" },
					ownerA,
				),
			404,
		);
		await expectAppError(
			() => PropertyServices.deleteProperty(propertyId, ownerA),
			404,
		);
	});
});

describe("manager assignment", () => {
	it("lets an owner assign and remove an active manager", async () => {
		const updates: Array<string | null> = [];

		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerA.id,
					managerId: null,
				}),
				update: async (args: { data: { managerId: string | null } }) => {
					updates.push(args.data.managerId);
					return { ...propertyRecord, managerId: args.data.managerId };
				},
			},
			user: {
				findFirst: async () => ({ id: managerId }),
			},
		});

		await PropertyServices.assignManager(propertyId, { managerId }, ownerA);
		await PropertyServices.assignManager(
			propertyId,
			{ managerId: null },
			ownerA,
		);

		assert.deepEqual(updates, [managerId, null]);
	});

	it("blocks manager assignment by unauthorized users and rejects deleted managers", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: ownerA.id,
					managerId: null,
				}),
			},
			user: {
				findFirst: async () => null,
			},
		});

		await expectAppError(
			() => PropertyServices.assignManager(propertyId, { managerId }, tenant),
			403,
		);
		await expectAppError(
			() => PropertyServices.assignManager(propertyId, { managerId }, ownerA),
			404,
		);
	});
});

describe("property list/search/filter/pagination", () => {
	it("returns paginated published properties and applies search, filters, and sort", async () => {
		type FindManyArgs = {
			where: { AND: unknown[] };
			skip: number;
			take: number;
			orderBy: Record<string, string>[];
		};
		const capture: { findManyArgs?: FindManyArgs } = {};

		setDb({
			$transaction: async (operations: Promise<unknown>[]) =>
				Promise.all(operations),
			property: {
				findMany: async (args: FindManyArgs) => {
					capture.findManyArgs = args;
					return [publicPropertyRecord];
				},
				count: async () => 1,
			},
		});

		const result = await PropertyServices.getProperties({
			...validQuery,
			page: 2,
			limit: 5,
			search: "lake",
			city: "Dhaka",
			state: "Dhaka",
			country: "Bangladesh",
			propertyType: PropertyType.APARTMENT,
			minPrice: "10000",
			maxPrice: "20000",
			availableFrom: new Date("2026-10-15T00:00:00.000Z"),
			availableTo: new Date("2026-10-20T00:00:00.000Z"),
			sortBy: "title",
			sortOrder: "asc",
		});

		assert.equal(result.meta.page, 2);
		assert.equal(result.meta.limit, 5);
		assert.equal(result.meta.total, 1);
		assert.equal(result.meta.totalPage, 1);
		assert.ok(capture.findManyArgs);
		const findManyArgs = capture.findManyArgs;
		assert.equal(findManyArgs.skip, 5);
		assert.equal(findManyArgs.take, 5);
		assert.deepEqual(findManyArgs.orderBy, [{ title: "asc" }, { id: "asc" }]);
		assert.deepEqual(findManyArgs.where.AND.at(0), { deletedAt: null });
		assert.deepEqual(findManyArgs.where.AND.at(1), {
			status: PropertyStatus.PUBLISHED,
		});
		assert.ok(JSON.stringify(findManyArgs.where).includes("monthlyRent"));
		assert.ok(JSON.stringify(findManyArgs.where).includes("availability"));
		assert.equal("ownerId" in result.data[0], false);
		assert.equal("managerId" in result.data[0], false);
		const publicResult = result.data[0] as unknown as {
			minMonthlyRent: number;
			availableRoomCount: number;
		};
		assert.equal(publicResult.minMonthlyRent, 15000);
		assert.equal(publicResult.availableRoomCount, 1);
	});

	it("returns only authenticated owner's active properties from my-properties", async () => {
		let whereConditions: unknown[] = [];
		let orderBy: unknown;

		setDb({
			$transaction: async (operations: Promise<unknown>[]) =>
				Promise.all(operations),
			property: {
				findMany: async (args: { where: { AND: unknown[] } }) => {
					whereConditions = args.where.AND;
					orderBy = (args as unknown as { orderBy: Record<string, string>[] })
						.orderBy;
					return [propertyRecord];
				},
				count: async () => 1,
			},
		});

		await PropertyServices.getMyProperties(validQuery, ownerA);

		assert.deepEqual(whereConditions.at(0), { deletedAt: null });
		assert.deepEqual(whereConditions.at(1), { ownerId: ownerA.id });
		assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "asc" }]);
	});

	it("keeps private and deleted property details inaccessible and returns a safe public detail DTO", async () => {
		setDb({
			property: {
				findFirst: async (args: { where: { id: string } }) =>
					args.where.id === propertyId ? publicPropertyRecord : null,
			},
		});

		const result = await PropertyServices.getPropertyById(propertyId);
		assert.equal(result.id, propertyId);
		assert.equal("ownerId" in result, false);
		assert.equal("managerId" in result, false);

		await expectAppError(
			() =>
				PropertyServices.getPropertyById(
					"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				),
			404,
		);
	});
});

describe("property validation", () => {
	it("rejects invalid property payloads and privileged update fields", () => {
		assert.equal(
			PropertyValidation.CreatePropertyZodSchema.safeParse({
				...createPayload,
				title: "",
			}).success,
			false,
		);

		assert.equal(
			PropertyValidation.UpdatePropertyZodSchema.safeParse({
				ownerId: ownerB.id,
			}).success,
			false,
		);
	});

	it("rejects invalid UUIDs, pagination, sort, filters, and manager IDs", () => {
		assert.equal(
			PropertyValidation.PropertyIdParamZodSchema.safeParse({
				id: "not-a-uuid",
			}).success,
			false,
		);
		assert.equal(
			PropertyValidation.PropertyQueryZodSchema.safeParse({
				page: 0,
				limit: 101,
				sortBy: "ownerId",
				sortOrder: "sideways",
				status: "ACTIVE",
				minPrice: "-1",
				availableFrom: "2026-12-01T00:00:00.000Z",
				availableTo: "2026-10-01T00:00:00.000Z",
			}).success,
			false,
		);
		assert.equal(
			PropertyValidation.PropertyQueryZodSchema.safeParse({
				minPrice: "30000",
				maxPrice: "10000",
			}).success,
			false,
		);
		assert.equal(
			PropertyValidation.AssignManagerZodSchema.safeParse({
				managerId: "not-a-uuid",
			}).success,
			false,
		);
	});

	it("allows manager removal and a valid query", () => {
		assert.equal(
			PropertyValidation.AssignManagerZodSchema.safeParse({
				managerId: null,
			}).success,
			true,
		);
		assert.equal(
			PropertyValidation.PropertyQueryZodSchema.safeParse({
				search: "dhaka",
				city: "Dhaka",
				state: "Dhaka",
				country: "Bangladesh",
				minPrice: "10000",
				maxPrice: "30000",
				availableFrom: "2026-10-01T00:00:00.000Z",
				availableTo: "2026-11-01T00:00:00.000Z",
				status: PropertyStatus.PUBLISHED,
				propertyType: PropertyType.APARTMENT,
				sortBy: "propertyType",
			}).success,
			true,
		);
	});
});

describe("unique conflict handling", () => {
	it("maps duplicate active property titles to conflict", async () => {
		setDb({
			property: {
				create: async () => {
					throw new Prisma.PrismaClientKnownRequestError("Unique failed", {
						code: "P2002",
						clientVersion: "test",
					});
				},
			},
		});

		await expectAppError(
			() => PropertyServices.createProperty(createPayload, ownerA),
			409,
		);
	});
});
