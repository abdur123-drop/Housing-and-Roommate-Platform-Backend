import type {
	TCompatibilityBreakdown,
	TScoringProfile,
} from "./roommate.interface";

const WEIGHTS = {
	budget: 30,
	location: 20,
	moveIn: 15,
	lifestyle: 20,
	preferences: 15,
} as const;

const normalize = (value: string | null | undefined) =>
	value?.trim().toLowerCase() || null;

const scoreDimension = (weight: number, ratio: number | null) => {
	if (ratio === null) return null;
	return weight * Math.max(0, Math.min(1, ratio));
};

const budgetScore = (
	a: Pick<TScoringProfile, "budgetMin" | "budgetMax">,
	b: Pick<TScoringProfile, "budgetMin" | "budgetMax">,
) => {
	if (
		a.budgetMin === null ||
		a.budgetMax === null ||
		b.budgetMin === null ||
		b.budgetMax === null
	) {
		return null;
	}

	const low = Math.max(a.budgetMin, b.budgetMin);
	const high = Math.min(a.budgetMax, b.budgetMax);
	const overlap = Math.max(0, high - low);
	const widestRange = Math.max(
		a.budgetMax - a.budgetMin,
		b.budgetMax - b.budgetMin,
		1,
	);

	return overlap / widestRange;
};

const locationScore = (a: TScoringProfile, b: TScoringProfile) => {
	const aLocation = normalize(a.preferredLocation);
	const bLocation = normalize(b.preferredLocation);

	if (!aLocation || !bLocation) return null;
	if (aLocation === bLocation) return 1;
	if (aLocation.includes(bLocation) || bLocation.includes(aLocation))
		return 0.7;

	return 0;
};

const moveInScore = (a: TScoringProfile, b: TScoringProfile) => {
	if (!a.moveInDate || !b.moveInDate) return null;

	const daysApart =
		Math.abs(a.moveInDate.getTime() - b.moveInDate.getTime()) /
		(1000 * 60 * 60 * 24);

	if (daysApart <= 7) return 1;
	if (daysApart <= 30) return 0.75;
	if (daysApart <= 90) return 0.35;
	return 0;
};

const lifestyleScore = (a: TScoringProfile, b: TScoringProfile) => {
	const dimensions: number[] = [];

	if (a.smoking !== null && b.smoking !== null) {
		dimensions.push(a.smoking === b.smoking ? 1 : 0);
	}

	if (a.pets !== null && b.pets !== null) {
		dimensions.push(a.pets === b.pets ? 1 : 0);
	}

	const aGender = normalize(a.genderPreference);
	const bGender = normalize(b.genderPreference);
	if (aGender && bGender) {
		dimensions.push(aGender === bGender ? 1 : 0.5);
	}

	if (!dimensions.length) return null;

	return dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length;
};

const preferenceScore = (a: TScoringProfile, b: TScoringProfile) => {
	if (!a.preferences.length || !b.preferences.length) return null;

	const bPreferences = new Map(
		b.preferences.map((preference) => [
			preference.preferenceId,
			normalize(preference.value),
		]),
	);
	let matched = 0;
	let compared = 0;

	for (const preference of a.preferences) {
		if (!bPreferences.has(preference.preferenceId)) continue;

		compared += 1;
		const aValue = normalize(preference.value);
		const bValue = bPreferences.get(preference.preferenceId);

		if (!aValue || !bValue || aValue === bValue) {
			matched += 1;
		}
	}

	if (!compared) return 0;
	return matched / compared;
};

export const calculateCompatibilityScore = (
	current: TScoringProfile,
	candidate: TScoringProfile,
) => {
	const dimensions = {
		budget: scoreDimension(WEIGHTS.budget, budgetScore(current, candidate)),
		location: scoreDimension(
			WEIGHTS.location,
			locationScore(current, candidate),
		),
		moveIn: scoreDimension(WEIGHTS.moveIn, moveInScore(current, candidate)),
		lifestyle: scoreDimension(
			WEIGHTS.lifestyle,
			lifestyleScore(current, candidate),
		),
		preferences: scoreDimension(
			WEIGHTS.preferences,
			preferenceScore(current, candidate),
		),
	};

	const availableWeight = Object.entries(dimensions).reduce(
		(sum, [key, value]) =>
			sum + (value === null ? 0 : WEIGHTS[key as keyof typeof WEIGHTS]),
		0,
	);

	if (!availableWeight) {
		return {
			score: 50,
			breakdown: {
				budget: 0,
				location: 0,
				moveIn: 0,
				lifestyle: 0,
				preferences: 0,
			} satisfies TCompatibilityBreakdown,
		};
	}

	const rawScore = Object.values(dimensions).reduce<number>(
		(sum, value) => sum + (value ?? 0),
		0,
	);
	const normalizedScore = Math.round((rawScore / availableWeight) * 100);

	return {
		score: Math.max(0, Math.min(100, normalizedScore)),
		breakdown: {
			budget: Math.round(dimensions.budget ?? 0),
			location: Math.round(dimensions.location ?? 0),
			moveIn: Math.round(dimensions.moveIn ?? 0),
			lifestyle: Math.round(dimensions.lifestyle ?? 0),
			preferences: Math.round(dimensions.preferences ?? 0),
		} satisfies TCompatibilityBreakdown,
	};
};

export const RoommateMatching = {
	calculateCompatibilityScore,
};
