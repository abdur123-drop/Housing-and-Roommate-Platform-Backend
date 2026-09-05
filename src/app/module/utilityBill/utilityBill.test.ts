import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	Prisma,
	UtilityBillStatus,
	UtilitySplitStatus,
	UtilityType,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	resetUtilityPrismaForTest,
	setUtilityPrismaForTest,
	UtilityBillServices,
} from "./utilityBill.service";
import { UtilityBillValidation } from "./utilityBill.validation";

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
const otherTenant: RequestUser = {
	...tenant,
	id: "33333333-3333-4333-8333-333333333333",
	userId: "33333333-3333-4333-8333-333333333333",
};
const propertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const unitId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const billId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = new Date("2026-09-05T00:00:00.000Z");

const bill = {
	id: billId,
	propertyId,
	unitId,
	type: UtilityType.ELECTRICITY,
	totalAmount: "3000.00",
	currency: "BDT",
	billingPeriodStart: now,
	billingPeriodEnd: new Date("2026-10-05T00:00:00.000Z"),
	dueDate: new Date("2026-09-20T00:00:00.000Z"),
	status: UtilityBillStatus.PENDING,
	createdAt: now,
	updatedAt: now,
	property: {
		id: propertyId,
		title: "Lake View",
		propertyType: "APARTMENT",
		city: "Dhaka",
		country: "Bangladesh",
		ownerId: owner.id,
		managerId: null,
	},
	unit: {
		id: unitId,
		unitNumber: "A-1",
		building: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Tower A" },
	},
};

const setDb = (db: unknown) =>
	setUtilityPrismaForTest(db as Parameters<typeof setUtilityPrismaForTest>[0]);
const expectAppError = async (
	fn: () => Promise<unknown>,
	statusCode: number,
) => {
	await assert.rejects(
		fn,
		(error) => error instanceof AppError && error.statusCode === statusCode,
	);
};

afterEach(() => resetUtilityPrismaForTest());

describe("utility bill creation and authorization", () => {
	it("allows an owner to create a BDT bill and derives status", async () => {
		let args: { data: Record<string, unknown> } | undefined;
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: owner.id,
					managerId: null,
				}),
			},
			unit: { findFirst: async () => ({ id: unitId }) },
			utilityBill: {
				create: async (value: { data: Record<string, unknown> }) => {
					args = value;
					return bill;
				},
			},
		});
		const result = await UtilityBillServices.createUtilityBill(
			{
				propertyId,
				unitId,
				type: UtilityType.ELECTRICITY,
				totalAmount: "3000.00",
				billingPeriodStart: now,
				billingPeriodEnd: bill.billingPeriodEnd,
				dueDate: bill.dueDate,
			},
			owner,
		);
		assert.equal(args?.data.currency, "BDT");
		assert.equal(args?.data.status, UtilityBillStatus.PENDING);
		assert.equal(result.totalAmount, 3000);
	});

	it("rejects tenant creation, unrelated properties, invalid amounts, and invalid periods", async () => {
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: otherTenant.id,
					managerId: null,
				}),
			},
		});
		await expectAppError(
			() =>
				UtilityBillServices.createUtilityBill(
					{
						propertyId,
						type: UtilityType.WATER,
						totalAmount: "1.00",
						billingPeriodStart: now,
						billingPeriodEnd: bill.billingPeriodEnd,
						dueDate: bill.dueDate,
					},
					tenant,
				),
			404,
		);
		await expectAppError(
			() =>
				UtilityBillServices.createUtilityBill(
					{
						propertyId,
						type: UtilityType.WATER,
						totalAmount: "1.00",
						billingPeriodStart: now,
						billingPeriodEnd: bill.billingPeriodEnd,
						dueDate: bill.dueDate,
					},
					owner,
				),
			404,
		);
		setDb({
			property: {
				findFirst: async () => ({
					id: propertyId,
					ownerId: owner.id,
					managerId: null,
				}),
			},
		});
		await expectAppError(
			() =>
				UtilityBillServices.createUtilityBill(
					{
						propertyId,
						type: UtilityType.WATER,
						totalAmount: "0.001",
						billingPeriodStart: now,
						billingPeriodEnd: bill.billingPeriodEnd,
						dueDate: bill.dueDate,
					},
					owner,
				),
			400,
		);
		const invalid = UtilityBillValidation.CreateUtilityBillZodSchema.safeParse({
			propertyId,
			type: UtilityType.WATER,
			totalAmount: "1.00",
			billingPeriodStart: bill.billingPeriodEnd.toISOString(),
			billingPeriodEnd: now.toISOString(),
			dueDate: now.toISOString(),
		});
		assert.equal(invalid.success, false);
	});
});

describe("utility bill splits", () => {
	it("creates a fixed split inside a bill-scoped transaction", async () => {
		let locked = false;
		let createArgs: { data: Record<string, unknown> } | undefined;
		setDb({
			utilityBill: { findFirst: async () => bill },
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					$executeRaw: async () => {
						locked = true;
					},
					utilityBill: { findFirst: async () => ({ totalAmount: "3000.00" }) },
					utilityBillSplit: {
						aggregate: async () => ({ _sum: { amount: "2000.00" } }),
						create: async (value: { data: Record<string, unknown> }) => {
							createArgs = value;
							return {
								id: "split-id",
								billId,
								tenantId: tenant.id,
								amount: "1000.00",
								status: UtilitySplitStatus.PENDING,
								paidAt: null,
								createdAt: now,
								tenant: { id: tenant.id, name: "Tenant", avatar: null },
							};
						},
					},
					lease: { findFirst: async () => ({ id: "lease-id" }) },
					user: { findFirst: async () => ({ id: tenant.id }) },
				}),
		});
		await UtilityBillServices.createSplit(
			billId,
			{ tenantId: tenant.id, amount: "1000.00" },
			owner,
		);
		assert.equal(locked, true);
		assert.equal(createArgs?.data.amount, "1000.00");
	});

	it("rejects over-allocation and duplicate tenants", async () => {
		setDb({
			utilityBill: { findFirst: async () => bill },
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					$executeRaw: async () => undefined,
					utilityBill: { findFirst: async () => ({ totalAmount: "3000.00" }) },
					utilityBillSplit: {
						aggregate: async () => ({ _sum: { amount: "2500.00" } }),
						create: async () => {
							throw new Prisma.PrismaClientKnownRequestError("duplicate", {
								code: "P2002",
								clientVersion: "test",
							});
						},
					},
					lease: { findFirst: async () => ({ id: "lease-id" }) },
					user: { findFirst: async () => ({ id: tenant.id }) },
				}),
		});
		await expectAppError(
			() =>
				UtilityBillServices.createSplit(
					billId,
					{ tenantId: tenant.id, amount: "600.00" },
					owner,
				),
			409,
		);
		await expectAppError(
			() =>
				UtilityBillServices.createSplit(
					billId,
					{ tenantId: tenant.id, amount: "500.00" },
					owner,
				),
			409,
		);
	});

	it("serializes same-bill concurrent allocations", async () => {
		let allocated = 2000;
		let queue = Promise.resolve();
		setDb({
			utilityBill: { findFirst: async () => bill },
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
				const previous = queue;
				let release!: () => void;
				queue = new Promise<void>((resolve) => {
					release = resolve;
				});
				await previous;
				try {
					return await callback({
						$executeRaw: async () => undefined,
						utilityBill: {
							findFirst: async () => ({ totalAmount: "3000.00" }),
						},
						utilityBillSplit: {
							aggregate: async () => ({ _sum: { amount: `${allocated}.00` } }),
							create: async () => {
								allocated += 1000;
								return {
									id: "split-id",
									billId,
									tenantId: tenant.id,
									amount: "1000.00",
									status: UtilitySplitStatus.PENDING,
									paidAt: null,
									createdAt: now,
									tenant: { id: tenant.id, name: "Tenant", avatar: null },
								};
							},
						},
						lease: { findFirst: async () => ({ id: "lease-id" }) },
						user: { findFirst: async () => ({ id: tenant.id }) },
					});
				} finally {
					release();
				}
			},
		});
		const results = await Promise.allSettled([
			UtilityBillServices.createSplit(
				billId,
				{ tenantId: tenant.id, amount: "1000.00" },
				owner,
			),
			UtilityBillServices.createSplit(
				billId,
				{ tenantId: otherTenant.id, amount: "1000.00" },
				owner,
			),
		]);
		assert.equal(
			results.filter((result) => result.status === "fulfilled").length,
			1,
		);
		assert.equal(
			results.filter((result) => result.status === "rejected").length,
			1,
		);
		assert.equal(allocated, 3000);
	});
});
