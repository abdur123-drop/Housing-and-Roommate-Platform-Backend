import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	Prisma,
	PropertyStatus,
	PropertyType,
	RoomStatus,
	RoomType,
	UnitStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { resetAuthorizationPrismaForTest } from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	RoomServices,
	resetRoomPrismaForTest,
	setRoomPrismaForTest,
} from "../room/room.service";
import { RoomValidation } from "../room/room.validation";
import {
	resetUnitPrismaForTest,
	setUnitPrismaForTest,
	UnitServices,
} from "../unit/unit.service";
import { UnitValidation } from "../unit/unit.validation";
import {
	BuildingServices,
	resetBuildingPrismaForTest,
	setBuildingPrismaForTest,
} from "./building.service";
import { BuildingValidation } from "./building.validation";

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

const managerA: RequestUser = {
	id: "44444444-4444-4444-8444-444444444444",
	userId: "44444444-4444-4444-8444-444444444444",
	email: "manager-a@example.com",
	roles: [AppRole.TENANT],
};

const admin: RequestUser = {
	id: "55555555-5555-4555-8555-555555555555",
	userId: "55555555-5555-4555-8555-555555555555",
	email: "admin@example.com",
	roles: [AppRole.ADMIN],
};

const propertyAId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyBId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const buildingAId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const buildingBId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const unitAId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const unitBId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const roomAId = "12121212-1212-4212-8212-121212121212";
const roomBId = "34343434-3434-4434-8434-343434343434";

const now = new Date("2026-01-01T00:00:00.000Z");

const propertyA = {
	id: propertyAId,
	ownerId: ownerA.id,
	managerId: managerA.id,
	deletedAt: null,
	status: PropertyStatus.PUBLISHED,
};

const propertyB = {
	id: propertyBId,
	ownerId: ownerB.id,
	managerId: null,
	deletedAt: null,
	status: PropertyStatus.PUBLISHED,
};

const buildingA = {
	id: buildingAId,
	propertyId: propertyAId,
	name: "North Tower",
	description: null,
	createdAt: now,
	updatedAt: now,
};

const unitA = {
	id: unitAId,
	buildingId: buildingAId,
	unitNumber: "A-101",
	floor: 1,
	bedrooms: 2,
	bathrooms: 1,
	status: UnitStatus.AVAILABLE,
	createdAt: now,
	updatedAt: now,
};

const roomA = {
	id: roomAId,
	unitId: unitAId,
	roomNumber: "R-1",
	name: "Window Room",
	roomType: RoomType.PRIVATE,
	monthlyRent: "900.00",
	securityDeposit: "100.00",
	status: RoomStatus.AVAILABLE,
	createdAt: now,
	updatedAt: now,
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

const conflict = () =>
	new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
		code: "P2002",
		clientVersion: "test",
	});

const asBuildingDb = (
	db: unknown,
): Parameters<typeof setBuildingPrismaForTest>[0] =>
	db as Parameters<typeof setBuildingPrismaForTest>[0];

const asUnitDb = (db: unknown): Parameters<typeof setUnitPrismaForTest>[0] =>
	db as Parameters<typeof setUnitPrismaForTest>[0];

const asRoomDb = (db: unknown): Parameters<typeof setRoomPrismaForTest>[0] =>
	db as Parameters<typeof setRoomPrismaForTest>[0];

afterEach(() => {
	resetAuthorizationPrismaForTest();
	resetBuildingPrismaForTest();
	resetUnitPrismaForTest();
	resetRoomPrismaForTest();
});

describe("building management", () => {
	it("allows owner, assigned manager, and admin to create buildings", async () => {
		let createCount = 0;
		const db = {
			property: { findFirst: async () => propertyA },
			building: {
				create: async () => {
					createCount += 1;
					return buildingA;
				},
			},
		};

		setBuildingPrismaForTest(asBuildingDb(db));

		await BuildingServices.createBuilding(
			propertyAId,
			{ name: "North Tower" },
			ownerA,
		);
		await BuildingServices.createBuilding(
			propertyAId,
			{ name: "North Tower" },
			managerA,
		);
		await BuildingServices.createBuilding(
			propertyAId,
			{ name: "North Tower" },
			admin,
		);

		assert.equal(createCount, 3);
	});

	it("denies tenant and another owner from managing a building hierarchy", async () => {
		const db = { property: { findFirst: async () => propertyA } };
		setBuildingPrismaForTest(asBuildingDb(db));

		await expectAppError(
			() =>
				BuildingServices.createBuilding(
					propertyAId,
					{ name: "North Tower" },
					tenant,
				),
			403,
		);
		await expectAppError(
			() =>
				BuildingServices.createBuilding(
					propertyAId,
					{ name: "North Tower" },
					ownerB,
				),
			403,
		);
	});

	it("protects building read/update/delete by resolving its property", async () => {
		let deletedAt: Date | undefined;
		const db = {
			building: {
				findFirst: async () => ({ property: propertyA }),
				update: async (args: { data: { deletedAt?: Date; name?: string } }) => {
					deletedAt = args.data.deletedAt;
					return { ...buildingA, name: args.data.name ?? buildingA.name };
				},
			},
		};

		setBuildingPrismaForTest(asBuildingDb(db));

		await BuildingServices.getBuildingById(buildingAId, ownerA);
		await BuildingServices.updateBuilding(
			buildingAId,
			{ name: "South Tower" },
			ownerA,
		);
		await BuildingServices.deleteBuilding(buildingAId, ownerA);

		assert.ok(deletedAt instanceof Date);
		await expectAppError(
			() => BuildingServices.getBuildingById(buildingBId, ownerB),
			403,
		);
	});

	it("excludes deleted buildings and maps duplicate names to 409", async () => {
		const listCapture: { where?: unknown } = {};
		const db = {
			property: { findFirst: async () => propertyA },
			$transaction: async (operations: Promise<unknown>[]) =>
				Promise.all(operations),
			building: {
				findMany: async (args: { where: unknown }) => {
					listCapture.where = args.where;
					return [];
				},
				count: async () => 0,
				create: async () => {
					throw conflict();
				},
			},
		};

		setBuildingPrismaForTest(asBuildingDb(db));

		await BuildingServices.listBuildings(
			propertyAId,
			{ page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" },
			ownerA,
		);
		assert.match(JSON.stringify(listCapture.where), /"deletedAt":null/);

		await expectAppError(
			() =>
				BuildingServices.createBuilding(
					propertyAId,
					{ name: "North Tower" },
					ownerA,
				),
			409,
		);
	});
});

describe("unit management", () => {
	it("creates units only when the user can manage the parent building", async () => {
		let createArgs: { data: { buildingId: string } } | undefined;
		const db = {
			building: { findFirst: async () => ({ property: propertyA }) },
			unit: {
				create: async (args: { data: { buildingId: string } }) => {
					createArgs = args;
					return unitA;
				},
			},
		};

		setUnitPrismaForTest(asUnitDb(db));

		await UnitServices.createUnit(
			buildingAId,
			{ unitNumber: "A-101" },
			managerA,
		);
		assert.equal(createArgs?.data.buildingId, buildingAId);

		await expectAppError(
			() =>
				UnitServices.createUnit(buildingAId, { unitNumber: "A-102" }, tenant),
			403,
		);
	});

	it("rejects cross-property unit creation and deleted parent resources", async () => {
		setUnitPrismaForTest(
			asUnitDb({
				building: { findFirst: async () => ({ property: propertyB }) },
			}),
		);

		await expectAppError(
			() =>
				UnitServices.createUnit(buildingBId, { unitNumber: "B-101" }, ownerA),
			403,
		);

		setUnitPrismaForTest(
			asUnitDb({
				building: { findFirst: async () => null },
			}),
		);

		await expectAppError(
			() =>
				UnitServices.createUnit(buildingAId, { unitNumber: "A-101" }, ownerA),
			404,
		);
	});

	it("protects unit read/update/delete and maps duplicate unit numbers to 409", async () => {
		const db = {
			building: { findFirst: async () => ({ property: propertyA }) },
			unit: {
				findFirst: async () => ({
					building: { deletedAt: null, property: propertyA },
				}),
				update: async () => unitA,
				create: async () => {
					throw conflict();
				},
			},
		};

		setUnitPrismaForTest(asUnitDb(db));

		await UnitServices.getUnitById(unitAId, ownerA);
		await UnitServices.updateUnit(unitAId, { bedrooms: 3 }, managerA);
		await UnitServices.deleteUnit(unitAId, admin);
		await expectAppError(() => UnitServices.getUnitById(unitBId, ownerB), 403);
		await expectAppError(
			() =>
				UnitServices.createUnit(buildingAId, { unitNumber: "A-101" }, ownerA),
			409,
		);
	});
});

describe("room management", () => {
	it("creates rooms only under an authorized unit hierarchy", async () => {
		let createArgs:
			| { data: { unitId: string; securityDeposit: string } }
			| undefined;
		const db = {
			unit: {
				findFirst: async () => ({
					building: { deletedAt: null, property: propertyA },
				}),
			},
			room: {
				create: async (args: {
					data: { unitId: string; securityDeposit: string };
				}) => {
					createArgs = args;
					return roomA;
				},
			},
		};

		setRoomPrismaForTest(asRoomDb(db));

		await RoomServices.createRoom(
			unitAId,
			{
				roomNumber: "R-1",
				roomType: RoomType.PRIVATE,
				monthlyRent: "900.00",
			},
			ownerA,
		);

		assert.equal(createArgs?.data.unitId, unitAId);
		assert.equal(createArgs?.data.securityDeposit, "0");
	});

	it("rejects cross-property room IDOR attempts and deleted parents", async () => {
		setRoomPrismaForTest(
			asRoomDb({
				unit: {
					findFirst: async () => ({
						building: { deletedAt: null, property: propertyB },
					}),
				},
			}),
		);

		await expectAppError(
			() =>
				RoomServices.createRoom(
					unitBId,
					{
						roomNumber: "R-1",
						roomType: RoomType.PRIVATE,
						monthlyRent: "900.00",
					},
					ownerA,
				),
			403,
		);

		setRoomPrismaForTest(
			asRoomDb({
				room: {
					findFirst: async () => ({
						unit: {
							deletedAt: null,
							building: { deletedAt: now, property: propertyA },
						},
					}),
				},
			}),
		);

		await expectAppError(() => RoomServices.getRoomById(roomAId, ownerA), 404);
	});

	it("protects room read/update/delete and maps duplicate room numbers to 409", async () => {
		const db = {
			unit: {
				findFirst: async () => ({
					building: { deletedAt: null, property: propertyA },
				}),
			},
			room: {
				findFirst: async () => ({
					unit: {
						deletedAt: null,
						building: { deletedAt: null, property: propertyA },
					},
				}),
				update: async () => roomA,
				create: async () => {
					throw conflict();
				},
			},
		};

		setRoomPrismaForTest(asRoomDb(db));

		await RoomServices.getRoomById(roomAId, ownerA);
		await RoomServices.updateRoom(
			roomAId,
			{ status: RoomStatus.MAINTENANCE },
			managerA,
		);
		await RoomServices.deleteRoom(roomAId, admin);
		await expectAppError(() => RoomServices.getRoomById(roomBId, ownerB), 403);
		await expectAppError(
			() =>
				RoomServices.createRoom(
					unitAId,
					{
						roomNumber: "R-1",
						roomType: RoomType.PRIVATE,
						monthlyRent: "900.00",
					},
					ownerA,
				),
			409,
		);
	});
});

describe("building/unit/room validation", () => {
	it("rejects invalid UUIDs, pagination, sorting, filters, and privileged fields", () => {
		assert.equal(
			BuildingValidation.PropertyBuildingParamZodSchema.safeParse({
				propertyId: "bad",
			}).success,
			false,
		);
		assert.equal(
			BuildingValidation.BuildingQueryZodSchema.safeParse({
				page: 0,
				limit: 101,
				sortBy: "propertyId",
			}).success,
			false,
		);
		assert.equal(
			BuildingValidation.UpdateBuildingZodSchema.safeParse({
				propertyId: propertyAId,
			}).success,
			false,
		);
		assert.equal(
			UnitValidation.UnitQueryZodSchema.safeParse({
				status: "BROKEN",
			}).success,
			false,
		);
		assert.equal(
			UnitValidation.UpdateUnitZodSchema.safeParse({
				buildingId: buildingBId,
			}).success,
			false,
		);
		assert.equal(
			RoomValidation.RoomQueryZodSchema.safeParse({
				roomType: PropertyType.HOUSE,
			}).success,
			false,
		);
		assert.equal(
			RoomValidation.UpdateRoomZodSchema.safeParse({
				unitId: unitBId,
			}).success,
			false,
		);
	});
});
