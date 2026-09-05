import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	AuditAction,
	AuditResourceType,
	createAuditLog,
	sanitizeAuditValue,
} from "../../utils/audit";
import {
	AuditLogServices,
	resetAuditPrismaForTest,
	setAuditPrismaForTest,
} from "./auditLog.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";

afterEach(() => resetAuditPrismaForTest());

describe("audit log service", () => {
	it("creates server-shaped records and removes sensitive metadata", async () => {
		let args: { data: Record<string, unknown> } | undefined;
		const client = {
			auditLog: {
				create: async (value: { data: Record<string, unknown> }) => {
					args = value;
					return value;
				},
			},
		} as never;
		await createAuditLog(client, {
			actorUserId: actorId,
			action: AuditAction.PROPERTY_DELETED,
			entityType: AuditResourceType.PROPERTY,
			entityId: resourceId,
			metadata: {
				reason: "retired",
				password: "secret",
				nested: { token: "jwt" },
			},
		});
		assert.equal(args?.data.actorUserId, actorId);
		assert.equal(args?.data.action, AuditAction.PROPERTY_DELETED);
		assert.deepEqual(args?.data.metadata, { reason: "retired", nested: {} });
		assert.equal(JSON.stringify(args).includes("secret"), false);
		assert.equal(JSON.stringify(args).includes("jwt"), false);
	});

	it("lists paginated audit records with validated database filters", async () => {
		let where: unknown;
		setAuditPrismaForTest({
			$transaction: async (operations: Promise<unknown>[]) =>
				Promise.all(operations),
			auditLog: {
				findMany: async (args: { where: unknown }) => {
					where = args.where;
					return [];
				},
				count: async () => 0,
			},
		} as never);
		const result = await AuditLogServices.listAuditLogs({
			page: 1,
			limit: 10,
			action: AuditAction.PROPERTY_DELETED,
			sortOrder: "desc",
		});
		assert.equal(result.meta.total, 0);
		assert.equal(
			(where as { action: string }).action,
			AuditAction.PROPERTY_DELETED,
		);
	});

	it("sanitizes arbitrary nested values without retaining secrets", () => {
		assert.deepEqual(
			sanitizeAuditValue({ authorization: "Bearer token", safe: true }),
			{ safe: true },
		);
	});
});
