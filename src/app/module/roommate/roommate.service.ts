import httpStatus from "http-status";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TPreferencePayload,
	TRoommateMatchQuery,
	TRoommatePreferencePayload,
	TRoommateProfilePayload,
	TRoommateQuery,
	TScoringProfile,
} from "./roommate.interface";
import { calculateCompatibilityScore } from "./roommate.matching";

let roommatePrisma: PrismaClient = prisma;

export const setRoommatePrismaForTest = (client: PrismaClient): void => {
	roommatePrisma = client;
};

export const resetRoommatePrismaForTest = (): void => {
	roommatePrisma = prisma;
};

const profileSelect = {
	id: true,
	bio: true,
	occupation: true,
	budgetMin: true,
	budgetMax: true,
	preferredLocation: true,
	moveInDate: true,
	smoking: true,
	pets: true,
	genderPreference: true,
	isDiscoverable: true,
	createdAt: true,
	updatedAt: true,
	user: {
		select: {
			id: true,
			name: true,
			avatar: true,
		},
	},
} as const;

const preferenceSelect = {
	id: true,
	name: true,
	type: true,
	createdAt: true,
} as const;

const userPreferenceSelect = {
	preferenceId: true,
	value: true,
	createdAt: true,
	preference: {
		select: {
			id: true,
			name: true,
			type: true,
		},
	},
} as const;

type ProfileRecord = Prisma.RoommateProfileGetPayload<{
	select: typeof profileSelect;
}>;

type ProfileWithPreferences = ProfileRecord & {
	user: ProfileRecord["user"] & {
		userPreferences?: {
			preferenceId: string;
			value: string | null;
			preference: {
				id: string;
				name: string;
				type: string | null;
			};
		}[];
	};
};

const ensureTenant = (user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can manage roommate profiles.",
		);
	}
};

const ensureAdmin = (user: RequestUser) => {
	if (!user.roles.includes(AppRole.ADMIN)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. You don't have permission to access this resource.",
		);
	}
};

const toNumber = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	const numberValue = Number(value.toString());
	return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeProfilePayload = (payload: TRoommateProfilePayload) =>
	Object.fromEntries(
		Object.entries(payload).filter(([, value]) => value !== undefined),
	);

const assertBudgetRange = (budgetMin: unknown, budgetMax: unknown): void => {
	const min = toNumber(budgetMin);
	const max = toNumber(budgetMax);

	if (min !== null && max !== null && min > max) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"budgetMin must be less than or equal to budgetMax",
		);
	}
};

const mapPrismaConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A roommate profile already exists for this tenant",
		);
	}

	throw error;
};

const profileToDto = (profile: ProfileWithPreferences) => ({
	id: profile.id,
	bio: profile.bio,
	occupation: profile.occupation,
	budgetMin: toNumber(profile.budgetMin),
	budgetMax: toNumber(profile.budgetMax),
	preferredLocation: profile.preferredLocation,
	moveInDate: profile.moveInDate,
	smoking: profile.smoking,
	pets: profile.pets,
	genderPreference: profile.genderPreference,
	isDiscoverable: profile.isDiscoverable,
	createdAt: profile.createdAt,
	updatedAt: profile.updatedAt,
	user: profile.user,
	preferences:
		profile.user.userPreferences?.map((item) => ({
			preferenceId: item.preferenceId,
			name: item.preference.name,
			type: item.preference.type,
			value: item.value,
		})) ?? [],
});

const toScoringProfile = (
	profile: ProfileWithPreferences,
): TScoringProfile => ({
	budgetMin: toNumber(profile.budgetMin),
	budgetMax: toNumber(profile.budgetMax),
	preferredLocation: profile.preferredLocation,
	moveInDate: profile.moveInDate,
	smoking: profile.smoking,
	pets: profile.pets,
	genderPreference: profile.genderPreference,
	preferences:
		profile.user.userPreferences?.map((item) => ({
			preferenceId: item.preferenceId,
			value: item.value,
		})) ?? [],
});

const buildDiscoveryWhere = (
	query: TRoommateMatchQuery | TRoommateQuery,
	excludeUserId?: string,
): Prisma.RoommateProfileWhereInput => {
	const andConditions: Prisma.RoommateProfileWhereInput[] = [
		{
			deletedAt: null,
			isDiscoverable: true,
			user: { deletedAt: null },
		},
	];

	if (excludeUserId) {
		andConditions.push({ userId: { not: excludeUserId } });
	}

	if (query.search) {
		andConditions.push({
			OR: [
				{ bio: { contains: query.search, mode: "insensitive" } },
				{ occupation: { contains: query.search, mode: "insensitive" } },
				{
					preferredLocation: {
						contains: query.search,
						mode: "insensitive",
					},
				},
			],
		});
	}

	if (query.location) {
		andConditions.push({
			preferredLocation: {
				contains: query.location,
				mode: "insensitive",
			},
		});
	}

	if (query.budgetMin) {
		andConditions.push({ budgetMax: { gte: query.budgetMin } });
	}

	if (query.budgetMax) {
		andConditions.push({ budgetMin: { lte: query.budgetMax } });
	}

	if (query.moveInFrom || query.moveInTo) {
		andConditions.push({
			moveInDate: {
				gte: query.moveInFrom,
				lte: query.moveInTo,
			},
		});
	}

	if (query.smoking !== undefined) {
		andConditions.push({ smoking: query.smoking });
	}

	if (query.pets !== undefined) {
		andConditions.push({ pets: query.pets });
	}

	if (query.genderPreference) {
		andConditions.push({
			genderPreference: {
				equals: query.genderPreference,
				mode: "insensitive",
			},
		});
	}

	return { AND: andConditions };
};

const findActiveMyProfile = async (
	userId: string,
	includePreferences = false,
) => {
	const profile = await roommatePrisma.roommateProfile.findFirst({
		where: {
			userId,
			deletedAt: null,
			user: { deletedAt: null },
		},
		select: includePreferences
			? {
					...profileSelect,
					user: {
						select: {
							...profileSelect.user.select,
							userPreferences: {
								where: { preference: { deletedAt: null } },
								select: userPreferenceSelect,
							},
						},
					},
				}
			: profileSelect,
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Roommate profile not found");
	}

	return profile as ProfileWithPreferences;
};

const createProfile = async (
	payload: TRoommateProfilePayload,
	user: RequestUser,
) => {
	ensureTenant(user);
	assertBudgetRange(payload.budgetMin, payload.budgetMax);

	const existing = await roommatePrisma.roommateProfile.findUnique({
		where: { userId: user.id },
		select: { id: true, deletedAt: true },
	});

	if (existing?.deletedAt === null) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A roommate profile already exists for this tenant",
		);
	}

	try {
		if (existing) {
			const restored = await roommatePrisma.roommateProfile.update({
				where: { id: existing.id },
				data: {
					...normalizeProfilePayload(payload),
					deletedAt: null,
				},
				select: profileSelect,
			});

			return profileToDto(restored as ProfileWithPreferences);
		}

		const profile = await roommatePrisma.roommateProfile.create({
			data: {
				...normalizeProfilePayload(payload),
				userId: user.id,
			},
			select: profileSelect,
		});

		return profileToDto(profile as ProfileWithPreferences);
	} catch (error) {
		return mapPrismaConflict(error);
	}
};

const getMyProfile = async (user: RequestUser) => {
	ensureTenant(user);
	const profile = await findActiveMyProfile(user.id, true);
	return profileToDto(profile);
};

const updateMyProfile = async (
	payload: TRoommateProfilePayload,
	user: RequestUser,
) => {
	ensureTenant(user);
	const existing = await findActiveMyProfile(user.id);
	assertBudgetRange(
		payload.budgetMin ?? existing.budgetMin,
		payload.budgetMax ?? existing.budgetMax,
	);

	const profile = await roommatePrisma.roommateProfile.update({
		where: { id: existing.id },
		data: normalizeProfilePayload(payload),
		select: profileSelect,
	});

	return profileToDto(profile as ProfileWithPreferences);
};

const deleteMyProfile = async (user: RequestUser) => {
	ensureTenant(user);
	const existing = await findActiveMyProfile(user.id);

	const profile = await roommatePrisma.roommateProfile.update({
		where: { id: existing.id },
		data: { deletedAt: new Date(), isDiscoverable: false },
		select: profileSelect,
	});

	return profileToDto(profile as ProfileWithPreferences);
};

const getProfileById = async (id: string, user: RequestUser) => {
	ensureTenant(user);
	const profile = await roommatePrisma.roommateProfile.findFirst({
		where: {
			id,
			deletedAt: null,
			isDiscoverable: true,
			user: { deletedAt: null },
		},
		select: {
			...profileSelect,
			user: {
				select: {
					...profileSelect.user.select,
					userPreferences: {
						where: { preference: { deletedAt: null } },
						select: userPreferenceSelect,
					},
				},
			},
		},
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Roommate profile not found");
	}

	return profileToDto(profile as ProfileWithPreferences);
};

const discoverRoommates = async (query: TRoommateQuery, user: RequestUser) => {
	ensureTenant(user);
	const skip = (query.page - 1) * query.limit;
	const where = buildDiscoveryWhere(query, user.id);

	const [profiles, total] = await roommatePrisma.$transaction([
		roommatePrisma.roommateProfile.findMany({
			where,
			skip,
			take: query.limit,
			orderBy: { [query.sortBy]: query.sortOrder },
			select: {
				...profileSelect,
				user: {
					select: {
						...profileSelect.user.select,
						userPreferences: {
							where: { preference: { deletedAt: null } },
							select: userPreferenceSelect,
						},
					},
				},
			},
		}),
		roommatePrisma.roommateProfile.count({ where }),
	]);

	return {
		data: profiles.map((profile) =>
			profileToDto(profile as ProfileWithPreferences),
		),
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const getMatches = async (query: TRoommateMatchQuery, user: RequestUser) => {
	ensureTenant(user);
	const currentProfile = await findActiveMyProfile(user.id, true);
	const where = buildDiscoveryWhere(query, user.id);
	const scoringWindow = Math.min(500, Math.max(100, query.page * query.limit));
	const [profiles, total] = await roommatePrisma.$transaction([
		roommatePrisma.roommateProfile.findMany({
			where,
			take: scoringWindow,
			orderBy: { createdAt: "desc" },
			select: {
				...profileSelect,
				user: {
					select: {
						...profileSelect.user.select,
						userPreferences: {
							where: { preference: { deletedAt: null } },
							select: userPreferenceSelect,
						},
					},
				},
			},
		}),
		roommatePrisma.roommateProfile.count({ where }),
	]);

	const currentScoringProfile = toScoringProfile(currentProfile);
	const scored = profiles
		.map((profile) => {
			const { score, breakdown } = calculateCompatibilityScore(
				currentScoringProfile,
				toScoringProfile(profile as ProfileWithPreferences),
			);

			return {
				profile: profileToDto(profile as ProfileWithPreferences),
				compatibilityScore: score,
				breakdown,
			};
		})
		.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

	const start = (query.page - 1) * query.limit;

	return {
		data: scored.slice(start, start + query.limit),
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const getMyPreferences = async (user: RequestUser) => {
	ensureTenant(user);

	return roommatePrisma.userPreference.findMany({
		where: {
			userId: user.id,
			preference: { deletedAt: null },
			user: { deletedAt: null },
		},
		orderBy: { createdAt: "asc" },
		select: userPreferenceSelect,
	});
};

const updateMyPreferences = async (
	payload: TRoommatePreferencePayload,
	user: RequestUser,
) => {
	ensureTenant(user);

	const preferenceIds = payload.preferences.map((item) => item.preferenceId);
	const existingCount = await roommatePrisma.preference.count({
		where: {
			id: { in: preferenceIds },
			deletedAt: null,
		},
	});

	if (existingCount !== preferenceIds.length) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"One or more preferences are invalid or deleted",
		);
	}

	await roommatePrisma.$transaction([
		roommatePrisma.userPreference.deleteMany({
			where: { userId: user.id },
		}),
		...(payload.preferences.length
			? [
					roommatePrisma.userPreference.createMany({
						data: payload.preferences.map((item) => ({
							userId: user.id,
							preferenceId: item.preferenceId,
							value: item.value,
						})),
					}),
				]
			: []),
	]);

	return getMyPreferences(user);
};

const getPreferences = async () =>
	roommatePrisma.preference.findMany({
		where: { deletedAt: null },
		orderBy: [{ type: "asc" }, { name: "asc" }],
		select: preferenceSelect,
	});

const createPreference = async (
	payload: TPreferencePayload,
	user: RequestUser,
) => {
	ensureAdmin(user);

	try {
		return await roommatePrisma.preference.create({
			data: payload,
			select: preferenceSelect,
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			throw new AppError(httpStatus.CONFLICT, "Preference already exists");
		}

		throw error;
	}
};

const updatePreference = async (
	id: string,
	payload: Partial<TPreferencePayload>,
	user: RequestUser,
) => {
	ensureAdmin(user);

	const existing = await roommatePrisma.preference.findFirst({
		where: { id, deletedAt: null },
		select: { id: true },
	});

	if (!existing) {
		throw new AppError(httpStatus.NOT_FOUND, "Preference not found");
	}

	try {
		return await roommatePrisma.preference.update({
			where: { id },
			data: payload,
			select: preferenceSelect,
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			throw new AppError(httpStatus.CONFLICT, "Preference already exists");
		}

		throw error;
	}
};

const deletePreference = async (id: string, user: RequestUser) => {
	ensureAdmin(user);

	const existing = await roommatePrisma.preference.findFirst({
		where: { id, deletedAt: null },
		select: { id: true },
	});

	if (!existing) {
		throw new AppError(httpStatus.NOT_FOUND, "Preference not found");
	}

	return roommatePrisma.preference.update({
		where: { id },
		data: { deletedAt: new Date() },
		select: preferenceSelect,
	});
};

export const RoommateServices = {
	createProfile,
	getMyProfile,
	updateMyProfile,
	deleteMyProfile,
	getProfileById,
	discoverRoommates,
	getMatches,
	getMyPreferences,
	updateMyPreferences,
	getPreferences,
	createPreference,
	updatePreference,
	deletePreference,
};
