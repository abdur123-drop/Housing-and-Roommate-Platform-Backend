import type {
	MaintenancePriority,
	MaintenanceStatus,
} from "../../../generated/prisma/enums";

export type TCreateMaintenanceRequestPayload = {
	roomId: string;
	title: string;
	description: string;
	priority?: MaintenancePriority;
};

export type TUpdateMaintenanceRequestPayload = {
	title?: string;
	description?: string;
	priority?: MaintenancePriority;
};

export type TMaintenanceRequestQuery = {
	page: number;
	limit: number;
	status?: MaintenanceStatus;
	priority?: MaintenancePriority;
	search?: string;
	sortBy: "createdAt" | "updatedAt" | "priority" | "status" | "resolvedAt";
	sortOrder: "asc" | "desc";
};

export type TMaintenanceAction = "start" | "resolve" | "close";
