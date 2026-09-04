export type TCreateBuildingPayload = {
	name: string;
	description?: string;
};

export type TUpdateBuildingPayload = Partial<TCreateBuildingPayload>;

export type TBuildingQuery = {
	page: number;
	limit: number;
	search?: string;
	sortBy: "name" | "createdAt" | "updatedAt";
	sortOrder: "asc" | "desc";
};
