import type {
	PropertyStatus,
	PropertyType,
} from "../../../generated/prisma/enums";

export type TCreatePropertyPayload = {
	title: string;
	description?: string;
	propertyType: PropertyType;
	address: string;
	city: string;
	state?: string;
	country: string;
	zipCode?: string;
	latitude?: string;
	longitude?: string;
	status?: PropertyStatus;
};

export type TUpdatePropertyPayload = Partial<TCreatePropertyPayload>;

export type TAssignPropertyManagerPayload = {
	managerId: string | null;
};

export type TPropertyQuery = {
	page: number;
	limit: number;
	search?: string;
	status?: PropertyStatus;
	propertyType?: PropertyType;
	city?: string;
	country?: string;
	sortBy: "createdAt" | "updatedAt" | "title" | "city" | "status";
	sortOrder: "asc" | "desc";
};
