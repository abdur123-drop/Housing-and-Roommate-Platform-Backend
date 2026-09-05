import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	AvailabilityStatus,
	PropertyStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { resetAuthorizationPrismaForTest } from "../../middleware/authorize";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	RoomAvailabilityServices,
	resetRoomAvailabilityPrismaForTest,
	setRoomAvailabilityPrismaForTest,
} from "./roomAvailability.service";
import { RoomAvailabilityValidation } from "./roomAvailability.validation";

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

type PropertyAccessFixture = {
	id: string;
	ownerId: string;
	managerId: string | null;
	deletedAt: Date | null;
	status: PropertyStatus;
};

const propertyA: PropertyAccessFixture = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	ownerId: ownerA.id,
	managerId: managerA.id,
	deletedAt: null,
	status: PropertyStatus.PUBLISHED,
};

const propertyB: PropertyAccessFixture = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	ownerId: ownerB.id,
	managerId: null,
	deletedAt: null,
	status: PropertyStatus.PUBLISHED,
};

const roomId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherRoomId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const availabilityId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherAvailabilityId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const from = new Date("2026-10-01T00:00:00.000Z");
const to = new Date("2026-11-01T00:00:00.000Z");
const adjacentFrom = new Date("2026-11-01T00:00:00.000Z");
const adjacentTo = new Date("2026-12-01T00:00:00.000Z");

const availabilityRecord = {
	id: availabilityId,
	roomId,
	availableFrom: from,
	availableTo: to,
	status: AvailabilityStatus.AVAILABLE,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const roomHierarchy = (property = propertyA) => ({
	unit: {
		deletedAt: null,
		building: {
			deletedAt: null,
			property,
		},
	},
});

const availabilityHierarchy = (property = propertyA) => ({
	room: {
		deletedAt: null,
		...roomHierarchy(property),
	},
});

const asDb = (
	db: unknown,
): Parameters<typeof setRoomAvailabilityPrismaForTest>[0] =>
	db as Parameters<typeof setRoomAvailabilityPrismaForTest>[0];

const txClient = (delegate: Record<string, unknown>, calls: string[]) => ({
	$executeRaw: async () => {
		calls.push("lock");
		return 1;
	},
	roomAvailability: delegate,
});

const transaction = (tx: unknown) => async (input: unknown) => {
	if (Array.isArray(input)) return Promise.all(input);
	return (input as (client: unknown) => Promise<unknown>)(tx);
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
	resetRoomAvailabilityPrismaForTest();
	resetAuthorizationPrismaForTest();
});

describe("room availability management", () => {
	it("allows owner, assigned manager, and admin to create availability", async () => {
		const calls: string[] = [];
		const txDelegate = {
			findFirst: async () => {
				calls.push("overlap-check");
				return null;
			},
			create: async () => {
				calls.push("create");
				return availabilityRecord;
			},
		};
		const db = {
			room: { findFirst: async () => roomHierarchy() },
			$transaction: transaction(txClient(txDelegate, calls)),
		};

		setRoomAvailabilityPrismaForTest(asDb(db));

		await RoomAvailabilityServices.createAvailability(
			roomId,
			{ availableFrom: from, availableTo: to },
			ownerA,
		);
		await RoomAvailabilityServices.createAvailability(
			roomId,
			{ availableFrom: from, availableTo: to },
			managerA,
		);
		await RoomAvailabilityServices.createAvailability(
			roomId,
			{ availableFrom: from, availableTo: to },
			admin,
		);

		assert.deepEqual(calls.slice(0, 3), ["lock", "overlap-check", "create"]);
	});

	it("denies tenant and another owner from creating availability for a room", async () => {
		setRoomAvailabilityPrismaForTest(
			asDb({ room: { findFirst: async () => roomHierarchy() } }),
		);

		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					roomId,
					{ availableFrom: from, availableTo: to },
					tenant,
				),
			403,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					roomId,
					{ availableFrom: from, availableTo: to },
					ownerB,
				),
			403,
		);
	});

	it("blocks cross-property POST, GET, PATCH, and DELETE IDOR attempts", async () => {
		setRoomAvailabilityPrismaForTest(
			asDb({
				room: { findFirst: async () => roomHierarchy(propertyB) },
				roomAvailability: {
					findFirst: async () => availabilityHierarchy(propertyB),
				},
			}),
		);

		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					otherRoomId,
					{ availableFrom: from, availableTo: to },
					ownerA,
				),
			403,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.getAvailabilityById(
					otherAvailabilityId,
					ownerA,
				),
			403,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.updateAvailability(
					otherAvailabilityId,
					{ status: AvailabilityStatus.UNAVAILABLE },
					ownerA,
				),
			403,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.deleteAvailability(
					otherAvailabilityId,
					ownerA,
				),
			403,
		);
	});

	it("excludes deleted availability and deleted parent resources", async () => {
		setRoomAvailabilityPrismaForTest(
			asDb({
				roomAvailability: { findFirst: async () => null },
				room: { findFirst: async () => null },
			}),
		);

		await expectAppError(
			() =>
				RoomAvailabilityServices.getAvailabilityById(availabilityId, ownerA),
			404,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					roomId,
					{ availableFrom: from, availableTo: to },
					ownerA,
				),
			404,
		);
	});
});

describe("availability date and overlap rules", () => {
	it("rejects invalid service-level date ranges", async () => {
		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					roomId,
					{ availableFrom: from, availableTo: from },
					ownerA,
				),
			400,
		);
		await expectAppError(
			() =>
				RoomAvailabilityServices.createAvailability(
					roomId,
					{ availableFrom: to, availableTo: from },
					ownerA,
				),
			400,
		);
	});

	it("rejects overlapping and duplicate ranges but allows adjacent half-open ranges", async () => {
		const overlaps = [
			{
				availableFrom: new Date("2026-10-15T00:00:00.000Z"),
				availableTo: new Date("2026-11-15T00:00:00.000Z"),
			},
			{
				availableFrom: new Date("2026-09-15T00:00:00.000Z"),
				availableTo: new Date("2026-10-15T00:00:00.000Z"),
			},
			{ availableFrom: from, availableTo: to },
		];

		for (const range of overlaps) {
			const txDelegate = {
				findFirst: async () => ({ id: availabilityId }),
				create: async () => availabilityRecord,
			};
			setRoomAvailabilityPrismaForTest(
				asDb({
					room: { findFirst: async () => roomHierarchy() },
					$transaction: transaction(txClient(txDelegate, [])),
				}),
			);

			await expectAppError(
				() =>
					RoomAvailabilityServices.createAvailability(roomId, range, ownerA),
				409,
			);
		}

		const txDelegate = {
			findFirst: async () => null,
			create: async () => ({
				...availabilityRecord,
				availableFrom: adjacentFrom,
				availableTo: adjacentTo,
			}),
		};
		setRoomAvailabilityPrismaForTest(
			asDb({
				room: { findFirst: async () => roomHierarchy() },
				$transaction: transaction(txClient(txDelegate, [])),
			}),
		);

		const result = await RoomAvailabilityServices.createAvailability(
			roomId,
			{ availableFrom: adjacentFrom, availableTo: adjacentTo },
			ownerA,
		);

		assert.equal(result.availableFrom, adjacentFrom);
	});

	it("excludes current record from update overlap checks", async () => {
		const calls: string[] = [];
		let updateWhere: unknown;
		const txDelegate = {
			findFirst: async (args: { where: { id?: { not?: string } } }) => {
				calls.push(args.where.id?.not ?? "no-exclude");
				return null;
			},
			update: async (args: { where: unknown }) => {
				updateWhere = args.where;
				return availabilityRecord;
			},
		};
		let findCount = 0;
		setRoomAvailabilityPrismaForTest(
			asDb({
				roomAvailability: {
					findFirst: async () => {
						findCount += 1;
						return findCount === 1
							? availabilityHierarchy()
							: availabilityRecord;
					},
				},
				$transaction: transaction(txClient(txDelegate, [])),
			}),
		);

		await RoomAvailabilityServices.updateAvailability(
			availabilityId,
			{ status: AvailabilityStatus.UNAVAILABLE },
			ownerA,
		);

		assert.deepEqual(calls, [availabilityId]);
		assert.deepEqual(updateWhere, { id: availabilityId });
	});

	it("allows soft-deleted availability ranges to be replaced", async () => {
		const txDelegate = {
			findFirst: async (args: { where: { deletedAt: null } }) => {
				assert.deepEqual(args.where.deletedAt, null);
				return null;
			},
			create: async () => availabilityRecord,
		};
		setRoomAvailabilityPrismaForTest(
			asDb({
				room: { findFirst: async () => roomHierarchy() },
				$transaction: transaction(txClient(txDelegate, [])),
			}),
		);

		await RoomAvailabilityServices.createAvailability(
			roomId,
			{ availableFrom: from, availableTo: to },
			ownerA,
		);
	});
});

describe("availability list/query and validation", () => {
	it("supports pagination, status filtering, date intersection filtering, and safe sorting", async () => {
		const capture: {
			where?: string;
			orderBy?: unknown;
			skip?: number;
			take?: number;
		} = {};
		setRoomAvailabilityPrismaForTest(
			asDb({
				room: { findFirst: async () => roomHierarchy() },
				$transaction: async (operations: Promise<unknown>[]) =>
					Promise.all(operations),
				roomAvailability: {
					findMany: async (args: {
						where: unknown;
						orderBy: unknown;
						skip: number;
						take: number;
					}) => {
						capture.where = JSON.stringify(args.where);
						capture.orderBy = args.orderBy;
						capture.skip = args.skip;
						capture.take = args.take;
						return [availabilityRecord];
					},
					count: async () => 1,
				},
			}),
		);

		const result = await RoomAvailabilityServices.listAvailability(
			roomId,
			{
				page: 2,
				limit: 5,
				status: AvailabilityStatus.AVAILABLE,
				from,
				to,
				sortBy: "availableFrom",
				sortOrder: "asc",
			},
			managerA,
		);

		assert.equal(result.meta.page, 2);
		assert.equal(result.meta.limit, 5);
		assert.equal(capture.skip, 5);
		assert.equal(capture.take, 5);
		assert.deepEqual(capture.orderBy, { availableFrom: "asc" });
		assert.match(capture.where ?? "", /"status":"AVAILABLE"/);
		assert.match(capture.where ?? "", /"deletedAt":null/);
	});

	it("validates dates, UUIDs, pagination, sorting, status, and privileged fields", () => {
		assert.equal(
			RoomAvailabilityValidation.CreateRoomAvailabilityZodSchema.safeParse({
				availableFrom: "2026-10-01T00:00:00.000Z",
				availableTo: "2026-11-01T00:00:00.000Z",
				status: AvailabilityStatus.AVAILABLE,
			}).success,
			true,
		);
		assert.equal(
			RoomAvailabilityValidation.CreateRoomAvailabilityZodSchema.safeParse({
				availableFrom: "2026-10-01T00:00:00.000Z",
				availableTo: "2026-10-01T00:00:00.000Z",
			}).success,
			false,
		);
		assert.equal(
			RoomAvailabilityValidation.CreateRoomAvailabilityZodSchema.safeParse({
				availableFrom: "not-a-date",
				availableTo: "2026-10-01T00:00:00.000Z",
			}).success,
			false,
		);
		assert.equal(
			RoomAvailabilityValidation.RoomAvailabilityParamZodSchema.safeParse({
				id: "bad",
			}).success,
			false,
		);
		assert.equal(
			RoomAvailabilityValidation.RoomAvailabilityQueryZodSchema.safeParse({
				page: 0,
				limit: 101,
				status: "BOOKED",
				sortBy: "roomId",
				sortOrder: "sideways",
			}).success,
			false,
		);
		assert.equal(
			RoomAvailabilityValidation.UpdateRoomAvailabilityZodSchema.safeParse({
				roomId,
			}).success,
			false,
		);
	});
});
