import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	MaintenancePriority,
	MaintenanceStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	MaintenanceRequestServices,
	resetMaintenancePrismaForTest,
	setMaintenancePrismaForTest,
} from "./maintenanceRequest.service";
import { MaintenanceRequestValidation } from "./maintenanceRequest.validation";

const tenant: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "tenant@example.com",
	roles: [AppRole.TENANT],
};
const otherTenant: RequestUser = {
	...tenant,
	id: "22222222-2222-4222-8222-222222222222",
	userId: "22222222-2222-4222-8222-222222222222",
};
const owner: RequestUser = {
	...tenant,
	id: "33333333-3333-4333-8333-333333333333",
	userId: "33333333-3333-4333-8333-333333333333",
	roles: [AppRole.OWNER],
};
const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = new Date("2026-09-05T00:00:00.000Z");

const requestRecord = {
	id: requestId,
	tenantId: tenant.id,
	propertyId,
	roomId,
	title: "Broken sink",
	description: "The kitchen sink is leaking.",
	priority: MaintenancePriority.MEDIUM,
	status: MaintenanceStatus.OPEN,
	assignedTo: null,
	createdAt: now,
	updatedAt: now,
	resolvedAt: null,
	tenant: { id: tenant.id, name: "Tenant", avatar: null },
	property: {
		id: propertyId,
		title: "Lake View",
		propertyType: "APARTMENT",
		city: "Dhaka",
		country: "Bangladesh",
		ownerId: owner.id,
		managerId: null,
	},
	room: {
		id: roomId,
		roomNumber: "101",
		name: "Blue room",
		unit: {
			id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			unitNumber: "A-1",
			building: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Tower A" },
		},
	},
};

const setDb = (db: unknown) =>
	setMaintenancePrismaForTest(
		db as Parameters<typeof setMaintenancePrismaForTest>[0],
	);
const expectAppError = async (
	fn: () => Promise<unknown>,
	statusCode: number,
) => {
	await assert.rejects(
		fn,
		(error) => error instanceof AppError && error.statusCode === statusCode,
	);
};

afterEach(() => resetMaintenancePrismaForTest());

describe("maintenance request creation", () => {
	it("derives tenant and property from the authenticated active lease", async () => {
		let createArgs: { data: Record<string, unknown> } | undefined;
		setDb({
			lease: {
				findFirst: async () => ({
					roomId,
					room: { unit: { building: { propertyId } } },
				}),
			},
			maintenanceRequest: {
				create: async (args: { data: Record<string, unknown> }) => {
					createArgs = args;
					return requestRecord;
				},
			},
		});
		const result = await MaintenanceRequestServices.createMaintenanceRequest(
			{
				roomId,
				title: "Broken sink",
				description: "The kitchen sink is leaking.",
			},
			tenant,
		);
		assert.equal(createArgs?.data.tenantId, tenant.id);
		assert.equal(createArgs?.data.propertyId, propertyId);
		assert.equal(createArgs?.data.status, MaintenanceStatus.OPEN);
		assert.equal(result.id, requestId);
	});

	it("rejects owners, missing/inactive leases, and client ownership fields", async () => {
		await expectAppError(
			() =>
				MaintenanceRequestServices.createMaintenanceRequest(
					{ roomId, title: "Issue", description: "Details" },
					owner,
				),
			403,
		);
		setDb({ lease: { findFirst: async () => null } });
		await expectAppError(
			() =>
				MaintenanceRequestServices.createMaintenanceRequest(
					{ roomId, title: "Issue", description: "Details" },
					tenant,
				),
			404,
		);
		const invalid =
			MaintenanceRequestValidation.CreateMaintenanceRequestZodSchema.safeParse({
				roomId,
				title: "Issue",
				description: "Details",
				tenantId: otherTenant.id,
				propertyId,
			});
		assert.equal(invalid.success, false);
	});
});

describe("maintenance access and lifecycle", () => {
	it("protects IDOR and allows the property owner to start a request", async () => {
		let updateWhere: Record<string, unknown> | undefined;
		setDb({
			maintenanceRequest: {
				findFirst: async () => requestRecord,
				updateMany: async (args: { where: Record<string, unknown> }) => {
					updateWhere = args.where;
					return { count: 1 };
				},
			},
		});
		await expectAppError(
			() => MaintenanceRequestServices.getRequestById(requestId, otherTenant),
			404,
		);
		const result = await MaintenanceRequestServices.transitionRequest(
			requestId,
			"start",
			owner,
		);
		assert.equal(updateWhere?.status, MaintenanceStatus.OPEN);
		assert.equal(result.id, requestId);
	});

	it("sets resolvedAt server-side and rejects stale transitions atomically", async () => {
		let resolveData: Record<string, unknown> | undefined;
		setDb({
			maintenanceRequest: {
				findFirst: async () => ({
					...requestRecord,
					status: MaintenanceStatus.IN_PROGRESS,
				}),
				updateMany: async (args: {
					where: Record<string, unknown>;
					data: Record<string, unknown>;
				}) => {
					resolveData = args.data;
					return { count: 1 };
				},
			},
		});
		await MaintenanceRequestServices.transitionRequest(
			requestId,
			"resolve",
			owner,
		);
		assert.equal(resolveData?.status, MaintenanceStatus.RESOLVED);
		assert.ok(resolveData?.resolvedAt instanceof Date);

		setDb({
			maintenanceRequest: {
				findFirst: async () => requestRecord,
				updateMany: async () => ({ count: 0 }),
			},
		});
		await expectAppError(
			() =>
				MaintenanceRequestServices.transitionRequest(
					requestId,
					"resolve",
					owner,
				),
			409,
		);
	});

	it("excludes soft-deleted and unrelated requests through database scopes", async () => {
		let listWhere: unknown;
		setDb({
			$transaction: async (operations: Promise<unknown>[]) =>
				Promise.all(operations),
			maintenanceRequest: {
				findMany: async (args: { where: unknown }) => {
					listWhere = args.where;
					return [];
				},
				count: async () => 0,
			},
		});
		const result = await MaintenanceRequestServices.getMyRequests(
			{ page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" },
			tenant,
		);
		assert.equal(result.meta.total, 0);
		assert.equal(JSON.stringify(listWhere).includes('"deletedAt":null'), true);
	});
});
