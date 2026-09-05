import type {
	AuditActionValue,
	AuditResourceTypeValue,
} from "../../utils/audit";

export type TAuditLogQuery = {
	page: number;
	limit: number;
	action?: AuditActionValue;
	entityType?: AuditResourceTypeValue;
	entityId?: string;
	actorUserId?: string;
	from?: Date;
	to?: Date;
	sortOrder: "asc" | "desc";
};
