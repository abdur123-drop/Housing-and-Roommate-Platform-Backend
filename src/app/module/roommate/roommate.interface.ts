export type TRoommateProfilePayload = {
	bio?: string;
	occupation?: string;
	budgetMin?: string;
	budgetMax?: string;
	preferredLocation?: string;
	moveInDate?: Date;
	smoking?: boolean;
	pets?: boolean;
	genderPreference?: string;
	isDiscoverable?: boolean;
};

export type TRoommatePreferencePayload = {
	preferences: {
		preferenceId: string;
		value?: string;
	}[];
};

export type TPreferencePayload = {
	name: string;
	type?: string;
};

export type TRoommateQuery = {
	page: number;
	limit: number;
	search?: string;
	location?: string;
	budgetMin?: string;
	budgetMax?: string;
	moveInFrom?: Date;
	moveInTo?: Date;
	smoking?: boolean;
	pets?: boolean;
	genderPreference?: string;
	sortBy: "createdAt" | "updatedAt" | "budgetMin" | "budgetMax" | "moveInDate";
	sortOrder: "asc" | "desc";
};

export type TRoommateMatchQuery = Omit<TRoommateQuery, "sortBy" | "sortOrder">;

export type TScoringProfile = {
	budgetMin: number | null;
	budgetMax: number | null;
	preferredLocation: string | null;
	moveInDate: Date | null;
	smoking: boolean | null;
	pets: boolean | null;
	genderPreference: string | null;
	preferences: {
		preferenceId: string;
		value: string | null;
	}[];
};

export type TCompatibilityBreakdown = {
	budget: number;
	location: number;
	moveIn: number;
	lifestyle: number;
	preferences: number;
};
