import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { TAuditLogQuery } from "./auditLog.interface";

let auditPrisma: PrismaClient = prisma;

export const setAuditPrismaForTest = (client: PrismaClient): void => {
	auditPrisma = client;
};

export const resetAuditPrismaForTest = (): void => {
	auditPrisma = prisma;
};

const auditSelect = {
	id: true,
	actorUserId: true,
	action: true,
	entityType: true,
	entityId: true,
	oldValue: true,
	newValue: true,
	metadata: true,
	createdAt: true,
	actor: { select: { id: true, name: true, email: true } },
} as const;

const listAuditLogs = async (query: TAuditLogQuery) => {
	const where: Prisma.AuditLogWhereInput = {
		action: query.action,
		entityType: query.entityType,
		entityId: query.entityId,
		actorUserId: query.actorUserId,
		createdAt: { gte: query.from, lt: query.to },
	};
	const [data, total] = await auditPrisma.$transaction([
		auditPrisma.auditLog.findMany({
			where,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
			select: auditSelect,
		}),
		auditPrisma.auditLog.count({ where }),
	]);
	return {
		data,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

export const AuditLogServices = { listAuditLogs };
