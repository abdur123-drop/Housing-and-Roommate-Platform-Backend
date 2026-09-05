import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppRole } from "../../constants/roles";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { calculateCompatibilityScore } from "./roommate.matching";
import {
	RoommateServices,
	resetRoommatePrismaForTest,
	setRoommatePrismaForTest,
} from "./roommate.service";
import { RoommateValidation } from "./roommate.validation";

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

const admin: RequestUser = {
	id: "44444444-4444-4444-8444-444444444444",
	userId: "44444444-4444-4444-8444-444444444444",
	email: "admin@example.com",
	roles: [AppRole.ADMIN],
};

const profileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const privateProfileId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const preferenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = new Date("2026-01-01T00:00:00.000Z");

const profileRecord = {
	id: profileId,
	userId: tenantA.id,
	bio: "Quiet reader",
	occupation: "Engineer",
	budgetMin: "10000",
	budgetMax: "18000",
	preferredLocation: "Dhaka",
	moveInDate: new Date("2026-10-01T00:00:00.000Z"),
	smoking: false,
	pets: true,
	genderPreference: "any",
	isDiscoverable: true,
	createdAt: now,
	updatedAt: now,
	user: {
		id: tenantA.id,
		name: "Tenant A",
		avatar: null,
	},
};

const profileWithPreferences = {
	...profileRecord,
	user: {
		...profileRecord.user,
		userPreferences: [
			{
				preferenceId,
				value: "quiet",
				createdAt: now,
				preference: { id: preferenceId, name: "Noise", type: "lifestyle" },
			},
		],
	},
};

const setDb = (db: unknown) => {
	setRoommatePrismaForTest(
		db as Parameters<typeof setRoommatePrismaForTest>[0],
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
	resetRoommatePrismaForTest();
});

describe("roommate compatibility score", () => {
	it("returns 100 for a perfect deterministic match", () => {
		const input = {
			budgetMin: 10000,
			budgetMax: 20000,
			preferredLocation: "Dhaka",
			moveInDate: new Date("2026-10-01T00:00:00.000Z"),
			smoking: false,
			pets: true,
			genderPreference: "any",
			preferences: [{ preferenceId, value: "quiet" }],
		};

		const first = calculateCompatibilityScore(input, input);
		const second = calculateCompatibilityScore(input, input);

		assert.equal(first.score, 100);
		assert.deepEqual(first, second);
		assert.ok(first.score >= 0 && first.score <= 100);
	});

	it("produces high, medium, and low scores from weighted dimensions", () => {
		const base = {
			budgetMin: 10000,
			budgetMax: 20000,
			preferredLocation: "Dhaka",
			moveInDate: new Date("2026-10-01T00:00:00.000Z"),
			smoking: false,
			pets: true,
			genderPreference: "any",
			preferences: [{ preferenceId, value: "quiet" }],
		};

		const high = calculateCompatibilityScore(base, {
			...base,
			budgetMin: 12000,
			moveInDate: new Date("2026-10-07T00:00:00.000Z"),
		});
		const medium = calculateCompatibilityScore(base, {
			...base,
			preferredLocation: "Uttara",
			pets: false,
			preferences: [{ preferenceId, value: "social" }],
		});
		const low = calculateCompatibilityScore(base, {
			...base,
			budgetMin: 30000,
			budgetMax: 40000,
			preferredLocation: "Sylhet",
			moveInDate: new Date("2027-06-01T00:00:00.000Z"),
			smoking: true,
			pets: false,
			preferences: [{ preferenceId, value: "social" }],
		});

		assert.ok(high.score > medium.score);
		assert.ok(medium.score > low.score);
		assert.ok(low.score >= 0);
	});

	it("uses neutral behavior when all comparable preferences are missing", () => {
		const empty = {
			budgetMin: null,
			budgetMax: null,
			preferredLocation: null,
			moveInDate: null,
			smoking: null,
			pets: null,
			genderPreference: null,
			preferences: [],
		};

		assert.equal(calculateCompatibilityScore(empty, empty).score, 50);
	});
});

describe("roommate profile service", () => {
	it("creates a profile for the authenticated tenant and ignores client ownership", async () => {
		let createArgs: unknown;

		setDb({
			roommateProfile: {
				findUnique: async () => null,
				create: async (args: unknown) => {
					createArgs = args;
					return profileRecord;
				},
			},
		});

		const result = await RoommateServices.createProfile(
			{
				bio: "Quiet reader",
				budgetMin: "10000",
				budgetMax: "18000",
				userId: tenantB.id,
			} as never,
			tenantA,
		);

		assert.equal(result.id, profileId);
		assert.equal(
			(createArgs as { data: { userId: string } }).data.userId,
			tenantA.id,
		);
	});

	it("rejects owner profile creation and duplicate active tenant profiles", async () => {
		await expectAppError(
			() => RoommateServices.createProfile({ bio: "Nope" }, owner),
			403,
		);

		setDb({
			roommateProfile: {
				findUnique: async () => ({ id: profileId, deletedAt: null }),
			},
		});

		await expectAppError(
			() => RoommateServices.createProfile({ bio: "Again" }, tenantA),
			409,
		);
	});

	it("retrieves, updates, and soft deletes only the authenticated tenant profile", async () => {
		let updateData: unknown;

		setDb({
			roommateProfile: {
				findFirst: async () => profileRecord,
				update: async (args: { data: unknown }) => {
					updateData = args.data;
					return {
						...profileRecord,
						...(args.data as Record<string, unknown>),
					};
				},
			},
		});

		const ownProfile = await RoommateServices.getMyProfile(tenantA);
		assert.equal(ownProfile.id, profileId);

		await RoommateServices.updateMyProfile({ bio: "Updated" }, tenantA);
		assert.deepEqual(updateData, { bio: "Updated" });

		await RoommateServices.deleteMyProfile(tenantA);
		const deletedUpdateData = updateData as unknown as {
			isDiscoverable: boolean;
			deletedAt: Date;
		};
		assert.equal(deletedUpdateData.isDiscoverable, false);
		assert.ok(deletedUpdateData.deletedAt instanceof Date);
	});

	it("does not expose private or missing profiles by UUID", async () => {
		setDb({ roommateProfile: { findFirst: async () => null } });

		await expectAppError(
			() => RoommateServices.getProfileById(privateProfileId, tenantA),
			404,
		);
	});
});

describe("roommate preferences", () => {
	it("replaces only the authenticated tenant preferences", async () => {
		const operations: string[] = [];

		setDb({
			preference: { count: async () => 1 },
			userPreference: {
				deleteMany: (args: { where: { userId: string } }) => {
					operations.push(`delete:${args.where.userId}`);
					return Promise.resolve({ count: 1 });
				},
				createMany: (args: { data: { userId: string }[] }) => {
					operations.push(`create:${args.data[0]?.userId}`);
					return Promise.resolve({ count: 1 });
				},
				findMany: async () => profileWithPreferences.user.userPreferences,
			},
			$transaction: transaction,
		});

		const result = await RoommateServices.updateMyPreferences(
			{ preferences: [{ preferenceId, value: "quiet" }] },
			tenantA,
		);

		assert.deepEqual(operations, [
			`delete:${tenantA.id}`,
			`create:${tenantA.id}`,
		]);
		assert.equal(result[0]?.preferenceId, preferenceId);
	});

	it("rejects invalid preference ids and invalid values", async () => {
		setDb({ preference: { count: async () => 0 } });

		await expectAppError(
			() =>
				RoommateServices.updateMyPreferences(
					{ preferences: [{ preferenceId, value: "quiet" }] },
					tenantA,
				),
			400,
		);

		assert.equal(
			RoommateValidation.UpsertMyPreferencesZodSchema.safeParse({
				preferences: [{ preferenceId, value: "" }],
			}).success,
			false,
		);
	});

	it("allows admins to manage reusable preferences", async () => {
		let deletedAt: Date | undefined;

		setDb({
			preference: {
				create: async () => ({
					id: preferenceId,
					name: "Quiet",
					type: "lifestyle",
					createdAt: now,
				}),
				findFirst: async () => ({ id: preferenceId }),
				update: async (args: { data: { deletedAt?: Date; name?: string } }) => {
					deletedAt = args.data.deletedAt;
					return {
						id: preferenceId,
						name: args.data.name ?? "Quiet",
						type: "lifestyle",
						createdAt: now,
					};
				},
			},
		});

		const created = await RoommateServices.createPreference(
			{ name: "Quiet", type: "lifestyle" },
			admin,
		);
		assert.equal(created.id, preferenceId);

		await RoommateServices.updatePreference(
			preferenceId,
			{ name: "Very quiet" },
			admin,
		);
		await RoommateServices.deletePreference(preferenceId, admin);
		assert.ok(deletedAt instanceof Date);

		await expectAppError(
			() =>
				RoommateServices.createPreference(
					{ name: "Not allowed", type: "x" },
					tenantA,
				),
			403,
		);
	});
});

describe("roommate discovery and matching", () => {
	it("uses safe discovery filters, pagination, and excludes the current tenant", async () => {
		let findManyArgs: unknown;
		let countArgs: unknown;

		setDb({
			roommateProfile: {
				findMany: async (args: unknown) => {
					findManyArgs = args;
					return [profileWithPreferences];
				},
				count: async (args: unknown) => {
					countArgs = args;
					return 1;
				},
			},
			$transaction: transaction,
		});

		const result = await RoommateServices.discoverRoommates(
			{
				page: 2,
				limit: 5,
				location: "dhaka",
				budgetMin: "9000",
				budgetMax: "20000",
				smoking: false,
				pets: true,
				sortBy: "createdAt",
				sortOrder: "desc",
			},
			tenantB,
		);

		const args = findManyArgs as {
			where: { AND: unknown[] };
			skip: number;
			take: number;
			select: Record<string, unknown>;
		};

		assert.equal(args.skip, 5);
		assert.equal(args.take, 5);
		assert.equal(args.select.user !== undefined, true);
		assert.ok(JSON.stringify(args.where).includes(tenantB.id));
		assert.deepEqual(countArgs, { where: args.where });
		assert.equal(result.meta.totalPage, 1);
		assert.equal("email" in result.data[0].user, false);
	});

	it("returns sorted, bounded, deterministic match scores for discoverable candidates", async () => {
		const weakCandidate = {
			...profileWithPreferences,
			id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			budgetMin: "30000",
			budgetMax: "40000",
			preferredLocation: "Sylhet",
			moveInDate: new Date("2027-06-01T00:00:00.000Z"),
			smoking: true,
			pets: false,
			user: {
				...profileWithPreferences.user,
				id: "55555555-5555-4555-8555-555555555555",
			},
		};

		setDb({
			roommateProfile: {
				findFirst: async () => profileWithPreferences,
				findMany: async () => [weakCandidate, profileWithPreferences],
				count: async () => 2,
			},
			$transaction: transaction,
		});

		const first = await RoommateServices.getMatches(
			{ page: 1, limit: 10 },
			tenantA,
		);
		const second = await RoommateServices.getMatches(
			{ page: 1, limit: 10 },
			tenantA,
		);

		assert.deepEqual(first, second);
		assert.equal(first.data.length, 2);
		assert.ok(
			first.data[0].compatibilityScore >= first.data[1].compatibilityScore,
		);
		assert.ok(first.data.every((match) => match.compatibilityScore >= 0));
		assert.ok(first.data.every((match) => match.compatibilityScore <= 100));
	});

	it("validates invalid UUIDs, ranges, dates, pagination, and sort fields", () => {
		assert.equal(
			RoommateValidation.RoommateIdParamZodSchema.safeParse({ id: "bad" })
				.success,
			false,
		);
		assert.equal(
			RoommateValidation.CreateRoommateProfileZodSchema.safeParse({
				budgetMin: "-1",
			}).success,
			false,
		);
		assert.equal(
			RoommateValidation.RoommateQueryZodSchema.safeParse({
				page: 0,
				limit: 101,
				sortBy: "password",
				sortOrder: "sideways",
				moveInFrom: "2026-12-01T00:00:00.000Z",
				moveInTo: "2026-10-01T00:00:00.000Z",
			}).success,
			false,
		);
	});
});
