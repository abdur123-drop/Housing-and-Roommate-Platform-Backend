import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	ApplicationStatus,
	PropertyType,
	RoomType,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	resetApplicationPrismaForTest,
	setApplicationPrismaForTest,
	ApplicationServices,
} from "./application.service";
import { ApplicationValidation } from "./application.validation";

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
const applicationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = new Date("2026-01-01T00:00:00.000Z");

const roomHierarchy = {
	id: roomId,
	unit: { building: { property: { id: propertyId } } },
};

const applicationRecord = {
	id: applicationId,
	userId: tenant.id,
	roomId,
	viewingRequestId: null,
	message: "I am interested.",
	status: ApplicationStatus.PENDING,
	submittedAt: now,
	updatedAt: now,
	user: { id: tenant.id, name: "Tenant", avatar: null },
	room: {
		id: roomId,
		roomNumber: "101",
		name: "Blue room",
		roomType: RoomType.PRIVATE,
		monthlyRent: "15000",
		unit: {
			id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			unitNumber: "A-1",
			building: {
				id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
				name: "Tower A",
				property: {
					id: propertyId,
					ownerId: owner.id,
					managerId: null,
					title: "Lake View",
					propertyType: PropertyType.APARTMENT,
					address: "12 Lake Road",
					city: "Dhaka",
					state: null,
					country: "Bangladesh",
				},
			},
		},
	},
	viewingRequest: null,
};

const setDb = (db: unknown) => {
	setApplicationPrismaForTest(
		db as Parameters<typeof setApplicationPrismaForTest>[0],
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

afterEach(() => resetApplicationPrismaForTest());

describe("application creation and validation", () => {
	it("derives the tenant and property from the authenticated user and room", async () => {
		let createArgs: { data: Record<string, unknown> } | undefined;
		setDb({
			room: { findFirst: async () => roomHierarchy },
			roomAvailability: { findFirst: async () => ({ id: "availability" }) },
			application: {
				create: async (args: { data: Record<string, unknown> }) => {
					createArgs = args;
					return applicationRecord;
				},
			},
		});

		const result = await ApplicationServices.createApplication(
			{ roomId, message: "I am interested." },
			tenant,
		);

		assert.equal(createArgs?.data.userId, tenant.id);
		assert.equal(createArgs?.data.roomId, roomId);
		assert.equal("propertyId" in (createArgs?.data ?? {}), false);
		assert.equal(createArgs?.data.status, ApplicationStatus.PENDING);
		assert.equal(result.id, applicationId);
	});

	it("rejects non-tenants, invalid rooms, unavailable rooms, and client ownership fields", async () => {
		await expectAppError(
			() => ApplicationServices.createApplication({ roomId }, owner),
			403,
		);

		setDb({ room: { findFirst: async () => null } });
		await expectAppError(
			() => ApplicationServices.createApplication({ roomId }, tenant),
			404,
		);

		setDb({
			room: { findFirst: async () => roomHierarchy },
			roomAvailability: { findFirst: async () => null },
		});
		await expectAppError(
			() => ApplicationServices.createApplication({ roomId }, tenant),
			400,
		);

		const invalid = ApplicationValidation.CreateApplicationZodSchema.safeParse({
			roomId,
			propertyId,
			status: ApplicationStatus.APPROVED,
		});
		assert.equal(invalid.success, false);
	});
});

describe("application access and transitions", () => {
	it("protects detail access and updates only a pending application", async () => {
		let updateWhere: Record<string, unknown> | undefined;
		setDb({
			application: {
				findFirst: async () => applicationRecord,
				updateMany: async (args: { where: Record<string, unknown> }) => {
					updateWhere = args.where;
					return { count: 1 };
				},
			},
		});

		await expectAppError(
			() => ApplicationServices.getApplicationById(applicationId, otherTenant),
			404,
		);

		const result = await ApplicationServices.transitionApplication(
			applicationId,
			"approve",
			owner,
		);

		assert.equal(updateWhere?.status, ApplicationStatus.PENDING);
		assert.equal(result.id, applicationId);
	});

	it("returns a conflict when another transition wins", async () => {
		setDb({
			application: {
				findFirst: async () => applicationRecord,
				updateMany: async () => ({ count: 0 }),
			},
		});

		await expectAppError(
			() =>
				ApplicationServices.transitionApplication(
					applicationId,
					"reject",
					owner,
				),
			409,
		);
	});
});
