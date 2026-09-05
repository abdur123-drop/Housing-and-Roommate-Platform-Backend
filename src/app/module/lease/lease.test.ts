import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	ApplicationStatus,
	LeaseStatus,
	PropertyType,
	RoomType,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	LeaseServices,
	resetLeasePrismaForTest,
	setLeasePrismaForTest,
} from "./lease.service";
import { LeaseValidation } from "./lease.validation";

const owner: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "owner@example.com",
	roles: [AppRole.OWNER],
};
const tenant: RequestUser = {
	id: "22222222-2222-4222-8222-222222222222",
	userId: "22222222-2222-4222-8222-222222222222",
	email: "tenant@example.com",
	roles: [AppRole.TENANT],
};
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const applicationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const leaseId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const propertyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const startDate = new Date("2026-10-01T00:00:00.000Z");

const application = {
	id: applicationId,
	userId: tenant.id,
	roomId,
	message: null,
	room: {
		monthlyRent: "15000",
		securityDeposit: "30000",
		unit: {
			building: {
				property: { id: propertyId, ownerId: owner.id, managerId: null },
			},
		},
	},
};

const lease = {
	id: leaseId,
	applicationId,
	tenantId: tenant.id,
	roomId,
	startDate,
	endDate: null,
	monthlyRent: "15000",
	securityDeposit: "30000",
	status: LeaseStatus.ACTIVE,
	createdAt: startDate,
	updatedAt: startDate,
	tenant: { id: tenant.id, name: "Tenant", avatar: null },
	room: {
		id: roomId,
		roomNumber: "101",
		name: "Blue room",
		roomType: RoomType.PRIVATE,
		unit: {
			id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
			unitNumber: "A-1",
			building: {
				id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
				name: "Tower A",
				property: {
					id: propertyId,
					ownerId: owner.id,
					managerId: null,
					title: "Lake View",
					propertyType: PropertyType.APARTMENT,
					city: "Dhaka",
					country: "Bangladesh",
				},
			},
		},
	},
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

const setDb = (db: unknown) => {
	setLeasePrismaForTest(db as Parameters<typeof setLeasePrismaForTest>[0]);
};

afterEach(() => resetLeasePrismaForTest());

describe("lease creation", () => {
	it("derives tenant, room, rent, and active status from an approved application", async () => {
		let createArgs: { data: Record<string, unknown> } | undefined;
		let lockCalled = false;
		setDb({
			application: {
				findFirst: async () => ({
					...application,
					status: ApplicationStatus.APPROVED,
				}),
			},
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					$executeRaw: async () => {
						lockCalled = true;
					},
					lease: {
						findFirst: async () => null,
						create: async (args: { data: Record<string, unknown> }) => {
							createArgs = args;
							return lease;
						},
					},
				}),
		});

		const result = await LeaseServices.createLease(
			{ applicationId, startDate },
			owner,
		);
		assert.equal(lockCalled, true);
		assert.equal(createArgs?.data.tenantId, tenant.id);
		assert.equal(createArgs?.data.roomId, roomId);
		assert.equal(createArgs?.data.status, LeaseStatus.ACTIVE);
		assert.equal(createArgs?.data.monthlyRent, "15000");
		assert.equal(result.id, leaseId);
	});

	it("denies tenants and hides ineligible applications", async () => {
		setDb({ application: { findFirst: async () => application } });
		await expectAppError(
			() => LeaseServices.createLease({ applicationId, startDate }, tenant),
			404,
		);

		setDb({ application: { findFirst: async () => null } });
		await expectAppError(
			() => LeaseServices.createLease({ applicationId, startDate }, owner),
			404,
		);
	});

	it("rejects an occupied room before creating another active lease", async () => {
		setDb({
			application: { findFirst: async () => application },
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					$executeRaw: async () => undefined,
					lease: { findFirst: async () => ({ id: leaseId }) },
				}),
		});
		await expectAppError(
			() => LeaseServices.createLease({ applicationId, startDate }, owner),
			409,
		);
	});

	it("allows only one concurrent active lease for the same room", async () => {
		let active = false;
		let lockTail = Promise.resolve();
		setDb({
			application: { findFirst: async () => application },
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
				const previous = lockTail;
				let release!: () => void;
				lockTail = new Promise<void>((resolve) => {
					release = resolve;
				});
				await previous;
				try {
					return await callback({
						$executeRaw: async () => undefined,
						lease: {
							findFirst: async () => (active ? { id: leaseId } : null),
							create: async () => {
								active = true;
								return lease;
							},
						},
					});
				} finally {
					release();
				}
			},
		});

		const results = await Promise.allSettled([
			LeaseServices.createLease({ applicationId, startDate }, owner),
			LeaseServices.createLease({ applicationId, startDate }, owner),
		]);
		assert.equal(
			results.filter((result) => result.status === "fulfilled").length,
			1,
		);
		assert.equal(
			results.filter((result) => result.status === "rejected").length,
			1,
		);
		const rejected = results.find((result) => result.status === "rejected");
		assert.equal((rejected as PromiseRejectedResult).reason.statusCode, 409);
	});
});

describe("lease lifecycle and validation", () => {
	it("rejects invalid date ranges and client-controlled fields", () => {
		const invalidDate = LeaseValidation.CreateLeaseZodSchema.safeParse({
			applicationId,
			startDate: "2026-10-02T00:00:00.000Z",
			endDate: "2026-10-01T00:00:00.000Z",
		});
		assert.equal(invalidDate.success, false);
		const invalidFields = LeaseValidation.CreateLeaseZodSchema.safeParse({
			applicationId,
			startDate: "2026-10-01T00:00:00.000Z",
			status: "ACTIVE",
			propertyId,
		});
		assert.equal(invalidFields.success, false);
	});

	it("terminates only an active lease atomically", async () => {
		let updateWhere: Record<string, unknown> | undefined;
		setDb({
			lease: {
				findFirst: async () => lease,
				updateMany: async (args: { where: Record<string, unknown> }) => {
					updateWhere = args.where;
					return { count: 0 };
				},
			},
		});
		await expectAppError(
			() => LeaseServices.terminateLease(leaseId, owner),
			409,
		);
		assert.equal(updateWhere?.status, LeaseStatus.ACTIVE);
	});
});
