import httpStatus from "http-status";
import {
	Prisma,
	type PrismaClient,
	UtilityBillStatus,
	UtilitySplitStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
	TCreateUtilityBillPayload,
	TCreateUtilitySplitPayload,
	TUtilityBillQuery,
} from "./utilityBill.interface";

type UtilityPrisma = PrismaClient;
type UtilityTx = Prisma.TransactionClient;

let utilityPrisma: UtilityPrisma = prisma;

export const setUtilityPrismaForTest = (client: UtilityPrisma): void => {
	utilityPrisma = client;
};

export const resetUtilityPrismaForTest = (): void => {
	utilityPrisma = prisma;
};

const billSelect = {
	id: true,
	propertyId: true,
	unitId: true,
	type: true,
	totalAmount: true,
	currency: true,
	billingPeriodStart: true,
	billingPeriodEnd: true,
	dueDate: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	property: {
		select: {
			id: true,
			title: true,
			propertyType: true,
			city: true,
			country: true,
		},
	},
	unit: {
		select: {
			id: true,
			unitNumber: true,
			building: { select: { id: true, name: true } },
		},
	},
} as const;

type BillRecord = Prisma.UtilityBillGetPayload<{ select: typeof billSelect }>;

const splitSelect = {
	id: true,
	billId: true,
	tenantId: true,
	amount: true,
	status: true,
	paidAt: true,
	createdAt: true,
	tenant: { select: { id: true, name: true, avatar: true } },
} as const;

type SplitRecord = Prisma.UtilityBillSplitGetPayload<{
	select: typeof splitSelect;
}>;

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);
const isManager = (user: RequestUser) =>
	isAdmin(user) ||
	user.roles.includes(AppRole.OWNER) ||
	user.roles.includes(AppRole.TENANT);

const toNumber = (value: unknown): number => Number(value?.toString() ?? 0);

const toMinorUnits = (value: unknown): number => {
	const text = value?.toString() ?? "";
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new AppError(httpStatus.BAD_REQUEST, "Money amount is invalid");
	}
	const [whole, fraction = ""] = text.split(".");
	const minor = Number(`${whole}${fraction.padEnd(2, "0")}`);
	if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 999999999999) {
		throw new AppError(httpStatus.BAD_REQUEST, "Money amount is invalid");
	}
	return minor;
};

const minorToString = (minor: number): string => {
	const whole = Math.floor(minor / 100);
	const fraction = String(minor % 100).padStart(2, "0");
	return `${whole}.${fraction}`;
};

const billDto = (bill: BillRecord) => ({
	id: bill.id,
	propertyId: bill.propertyId,
	unitId: bill.unitId,
	type: bill.type,
	totalAmount: toNumber(bill.totalAmount),
	currency: bill.currency,
	billingPeriodStart: bill.billingPeriodStart,
	billingPeriodEnd: bill.billingPeriodEnd,
	dueDate: bill.dueDate,
	status: bill.status,
	createdAt: bill.createdAt,
	updatedAt: bill.updatedAt,
	property: bill.property,
	unit: bill.unit,
});

const splitDto = (split: SplitRecord, includeTenant: boolean) => ({
	id: split.id,
	billId: split.billId,
	tenantId: split.tenantId,
	amount: toNumber(split.amount),
	status: split.status,
	paidAt: split.paidAt,
	createdAt: split.createdAt,
	...(includeTenant ? { tenant: split.tenant } : {}),
});

const getProperty = async (propertyId: string) => {
	const property = await utilityPrisma.property.findFirst({
		where: { id: propertyId, deletedAt: null },
		select: { id: true, ownerId: true, managerId: true },
	});
	if (!property) throw new AppError(httpStatus.NOT_FOUND, "Property not found");
	return property;
};

const assertBillManager = (
	property: { ownerId: string; managerId: string | null },
	user: RequestUser,
) => {
	if (
		isAdmin(user) ||
		property.ownerId === user.id ||
		property.managerId === user.id
	)
		return;
	throw new AppError(httpStatus.NOT_FOUND, "Utility bill not found");
};

const createUtilityBill = async (
	payload: TCreateUtilityBillPayload,
	user: RequestUser,
) => {
	if (!isManager(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only owners, managers, or admins can create utility bills",
		);
	const property = await getProperty(payload.propertyId);
	assertBillManager(property, user);
	const totalMinor = toMinorUnits(payload.totalAmount);
	if (payload.billingPeriodStart >= payload.billingPeriodEnd) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"billingPeriodStart must be before billingPeriodEnd",
		);
	}

	if (payload.unitId) {
		const unit = await utilityPrisma.unit.findFirst({
			where: {
				id: payload.unitId,
				deletedAt: null,
				building: {
					deletedAt: null,
					propertyId: payload.propertyId,
					property: { deletedAt: null },
				},
			},
			select: { id: true },
		});
		if (!unit)
			throw new AppError(httpStatus.NOT_FOUND, "Unit not found for property");
	}

	const bill = await utilityPrisma.utilityBill.create({
		data: {
			propertyId: payload.propertyId,
			unitId: payload.unitId,
			type: payload.type,
			totalAmount: minorToString(totalMinor),
			currency: "BDT",
			billingPeriodStart: payload.billingPeriodStart,
			billingPeriodEnd: payload.billingPeriodEnd,
			dueDate: payload.dueDate,
			status: UtilityBillStatus.PENDING,
		},
		select: billSelect,
	});
	return billDto(bill);
};

const baseWhere: Prisma.UtilityBillWhereInput = {
	property: { deletedAt: null },
	OR: [
		{ unitId: null },
		{
			unit: {
				deletedAt: null,
				building: { deletedAt: null, property: { deletedAt: null } },
			},
		},
	],
};

const buildWhere = (
	query: TUtilityBillQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const conditions: Prisma.UtilityBillWhereInput[] = [baseWhere];
	if (scope.type === "tenant") {
		conditions.push({
			splits: { some: { tenantId: scope.userId, tenant: { deletedAt: null } } },
		});
	}
	if (scope.type === "managed" && !isAdmin(scope.user)) {
		conditions.push({
			property: {
				OR: [{ ownerId: scope.user.id }, { managerId: scope.user.id }],
			},
		});
	}
	if (query.status) conditions.push({ status: query.status });
	if (query.type) conditions.push({ type: query.type });
	if (query.from || query.to)
		conditions.push({ billingPeriodStart: { gte: query.from, lt: query.to } });
	return { AND: conditions };
};

const listBills = async (
	query: TUtilityBillQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const where = buildWhere(query, scope);
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		{ id: "asc" },
	] as Prisma.UtilityBillOrderByWithRelationInput[];
	const [data, total] = await utilityPrisma.$transaction([
		utilityPrisma.utilityBill.findMany({
			where,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			orderBy,
			select: billSelect,
		}),
		utilityPrisma.utilityBill.count({ where }),
	]);
	return {
		data: data.map(billDto),
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const getMyBills = async (query: TUtilityBillQuery, user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can access their utility bills",
		);
	return listBills(query, { type: "tenant", userId: user.id });
};

const getManagedBills = async (query: TUtilityBillQuery, user: RequestUser) => {
	if (!isManager(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to access utility bills",
		);
	return listBills(query, { type: "managed", user });
};

const getBillForManager = async (id: string) => {
	const bill = await utilityPrisma.utilityBill.findFirst({
		where: { id, ...baseWhere },
		select: {
			...billSelect,
			property: {
				select: {
					...billSelect.property.select,
					ownerId: true,
					managerId: true,
				},
			},
		},
	});
	if (!bill) throw new AppError(httpStatus.NOT_FOUND, "Utility bill not found");
	return bill;
};

const getUtilityBillById = async (id: string, user: RequestUser) => {
	const bill = await getBillForManager(id);
	const property = bill.property as typeof bill.property & {
		ownerId?: string;
		managerId?: string | null;
	};
	if (
		isAdmin(user) ||
		property.ownerId === user.id ||
		property.managerId === user.id
	)
		return billDto(bill as BillRecord);
	const split = await utilityPrisma.utilityBillSplit.findFirst({
		where: { billId: id, tenantId: user.id, tenant: { deletedAt: null } },
		select: splitSelect,
	});
	if (!split)
		throw new AppError(httpStatus.NOT_FOUND, "Utility bill not found");
	return { ...billDto(bill as BillRecord), splits: [splitDto(split, false)] };
};

const lockBill = async (tx: Pick<UtilityTx, "$executeRaw">, billId: string) => {
	await tx.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${billId}, 0))`,
	);
};

const createSplit = async (
	billId: string,
	payload: TCreateUtilitySplitPayload,
	user: RequestUser,
) => {
	if (!isManager(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only owners, managers, or admins can split utility bills",
		);
	const bill = await getBillForManager(billId);
	assertBillManager(bill.property, user);
	const requestedMinor = toMinorUnits(payload.amount);

	try {
		return await utilityPrisma.$transaction(async (tx) => {
			await lockBill(tx, billId);
			const currentBill = await tx.utilityBill.findFirst({
				where: { id: billId },
				select: { totalAmount: true },
			});
			if (!currentBill)
				throw new AppError(httpStatus.NOT_FOUND, "Utility bill not found");
			const aggregate = await tx.utilityBillSplit.aggregate({
				where: { billId },
				_sum: { amount: true },
			});
			const allocatedMinor = aggregate._sum.amount
				? toMinorUnits(aggregate._sum.amount)
				: 0;
			const remainingMinor =
				toMinorUnits(currentBill.totalAmount) - allocatedMinor;
			if (requestedMinor > remainingMinor)
				throw new AppError(
					httpStatus.CONFLICT,
					"Utility bill split exceeds the remaining amount",
				);

			if (bill.unitId) {
				const tenantLease = await tx.lease.findFirst({
					where: {
						tenantId: payload.tenantId,
						status: "ACTIVE",
						deletedAt: null,
						room: {
							unitId: bill.unitId,
							deletedAt: null,
							unit: {
								deletedAt: null,
								building: { deletedAt: null, property: { deletedAt: null } },
							},
						},
					},
					select: { id: true },
				});
				if (!tenantLease)
					throw new AppError(
						httpStatus.BAD_REQUEST,
						"Tenant has no active lease for this unit",
					);
			}
			const tenant = await tx.user.findFirst({
				where: { id: payload.tenantId, deletedAt: null },
				select: { id: true },
			});
			if (!tenant) throw new AppError(httpStatus.NOT_FOUND, "Tenant not found");
			return tx.utilityBillSplit.create({
				data: {
					billId,
					tenantId: payload.tenantId,
					amount: minorToString(requestedMinor),
					status: UtilitySplitStatus.PENDING,
				},
				select: splitSelect,
			});
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			throw new AppError(
				httpStatus.CONFLICT,
				"Tenant already has a split for this utility bill",
			);
		throw error;
	}
};

const getSplits = async (billId: string, user: RequestUser) => {
	const bill = await getBillForManager(billId);
	const property = bill.property;
	const manages =
		isAdmin(user) ||
		property.ownerId === user.id ||
		property.managerId === user.id;
	const where = manages
		? { billId }
		: { billId, tenantId: user.id, tenant: { deletedAt: null } };
	const splits = await utilityPrisma.utilityBillSplit.findMany({
		where,
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: splitSelect,
	});
	return splits.map((split) => splitDto(split, manages));
};

export const UtilityBillServices = {
	createUtilityBill,
	getMyBills,
	getManagedBills,
	getUtilityBillById,
	createSplit,
	getSplits,
};
