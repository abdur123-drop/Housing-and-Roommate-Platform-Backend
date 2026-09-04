import type { UnitStatus } from "../../../generated/prisma/enums";

export type TCreateUnitPayload = {
	unitNumber: string;
	floor?: number;
	bedrooms?: number;
	bathrooms?: number;
	status?: UnitStatus;
};

export type TUpdateUnitPayload = Partial<TCreateUnitPayload>;

export type TUnitQuery = {
	page: number;
	limit: number;
	search?: string;
	status?: UnitStatus;
	sortBy:
		| "unitNumber"
		| "floor"
		| "bedrooms"
		| "bathrooms"
		| "status"
		| "createdAt"
		| "updatedAt";
	sortOrder: "asc" | "desc";
};
