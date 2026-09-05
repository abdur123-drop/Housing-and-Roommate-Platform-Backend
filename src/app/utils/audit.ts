import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export const AuditAction = {
	PROPERTY_CREATED: "PROPERTY_CREATED",
	PROPERTY_UPDATED: "PROPERTY_UPDATED",
	PROPERTY_DELETED: "PROPERTY_DELETED",
	PROPERTY_MANAGER_ASSIGNED: "PROPERTY_MANAGER_ASSIGNED",
	PROPERTY_MANAGER_REMOVED: "PROPERTY_MANAGER_REMOVED",
	BUILDING_DELETED: "BUILDING_DELETED",
	UNIT_DELETED: "UNIT_DELETED",
	ROOM_DELETED: "ROOM_DELETED",
	AVAILABILITY_DELETED: "AVAILABILITY_DELETED",
	ROOMMATE_PROFILE_DELETED: "ROOMMATE_PROFILE_DELETED",
	VIEWING_REQUEST_APPROVED: "VIEWING_REQUEST_APPROVED",
	VIEWING_REQUEST_REJECTED: "VIEWING_REQUEST_REJECTED",
	VIEWING_REQUEST_CANCELLED: "VIEWING_REQUEST_CANCELLED",
	APPLICATION_APPROVED: "APPLICATION_APPROVED",
	APPLICATION_REJECTED: "APPLICATION_REJECTED",
	APPLICATION_WITHDRAWN: "APPLICATION_WITHDRAWN",
	LEASE_CREATED: "LEASE_CREATED",
	LEASE_TERMINATED: "LEASE_TERMINATED",
	PAYMENT_CREATED: "PAYMENT_CREATED",
	PAYMENT_STATUS_CHANGED: "PAYMENT_STATUS_CHANGED",
	UTILITY_BILL_CREATED: "UTILITY_BILL_CREATED",
	UTILITY_SPLIT_CREATED: "UTILITY_SPLIT_CREATED",
	MAINTENANCE_REQUEST_CREATED: "MAINTENANCE_REQUEST_CREATED",
	MAINTENANCE_REQUEST_STARTED: "MAINTENANCE_REQUEST_STARTED",
	MAINTENANCE_REQUEST_RESOLVED: "MAINTENANCE_REQUEST_RESOLVED",
	MAINTENANCE_REQUEST_CLOSED: "MAINTENANCE_REQUEST_CLOSED",
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResourceType = {
	PROPERTY: "PROPERTY",
	BUILDING: "BUILDING",
	UNIT: "UNIT",
	ROOM: "ROOM",
	ROOM_AVAILABILITY: "ROOM_AVAILABILITY",
	ROOMMATE_PROFILE: "ROOMMATE_PROFILE",
	VIEWING_REQUEST: "VIEWING_REQUEST",
	APPLICATION: "APPLICATION",
	LEASE: "LEASE",
	PAYMENT: "PAYMENT",
	UTILITY_BILL: "UTILITY_BILL",
	UTILITY_BILL_SPLIT: "UTILITY_BILL_SPLIT",
	MAINTENANCE_REQUEST: "MAINTENANCE_REQUEST",
} as const;

export type AuditResourceTypeValue =
	(typeof AuditResourceType)[keyof typeof AuditResourceType];

type AuditClient =
	| Pick<PrismaClient, "auditLog">
	| Pick<Prisma.TransactionClient, "auditLog">;

export type CreateAuditInput = {
	actorUserId?: string;
	action: AuditActionValue;
	entityType: AuditResourceTypeValue;
	entityId: string;
	oldValue?: unknown;
	newValue?: unknown;
	metadata?: unknown;
	ipAddress?: string;
	userAgent?: string;
};

const sensitiveKey =
	/(password|token|secret|authorization|cookie|card|cvc|client.?secret)/i;

const sanitize = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sanitize);
	if (value && typeof value === "object") {
		const output: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			if (!sensitiveKey.test(key)) output[key] = sanitize(nested);
		}
		return output;
	}
	if (["string", "number", "boolean"].includes(typeof value) || value === null)
		return value;
	return undefined;
};

export const createAuditLog = async (
	client: AuditClient,
	input: CreateAuditInput,
) => {
	const metadata = {
		...(input.metadata && typeof input.metadata === "object"
			? (sanitize(input.metadata) as Record<string, unknown>)
			: {}),
		...(input.ipAddress ? { ipAddress: input.ipAddress.slice(0, 45) } : {}),
		...(input.userAgent ? { userAgent: input.userAgent.slice(0, 255) } : {}),
	};
	return client.auditLog.create({
		data: {
			actorUserId: input.actorUserId,
			action: input.action,
			entityType: input.entityType,
			entityId: input.entityId,
			oldValue:
				input.oldValue === undefined
					? undefined
					: (sanitize(input.oldValue) as Prisma.InputJsonValue),
			newValue:
				input.newValue === undefined
					? undefined
					: (sanitize(input.newValue) as Prisma.InputJsonValue),
			metadata: Object.keys(metadata).length
				? (metadata as Prisma.InputJsonValue)
				: undefined,
		},
	});
};

export const createAuditLogIfAvailable = async (
	client: AuditClient,
	input: CreateAuditInput,
) => {
	if (!(client as { auditLog?: unknown }).auditLog) return;
	return createAuditLog(client, input);
};

export const sanitizeAuditValue = sanitize;
