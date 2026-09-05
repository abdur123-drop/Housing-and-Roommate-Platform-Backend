import httpStatus from "http-status";
import {
	LeaseStatus,
	PaymentProvider,
	Prisma,
	type PrismaClient,
	RentPaymentStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import { prisma } from "../../lib/prisma";
import { getStripe } from "../../lib/stripe";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type { TCreatePaymentPayload, TPaymentQuery } from "./payment.interface";

let paymentPrisma: PrismaClient = prisma;

export const setPaymentPrismaForTest = (client: PrismaClient): void => {
	paymentPrisma = client;
};

export const resetPaymentPrismaForTest = (): void => {
	paymentPrisma = prisma;
};

const paymentSelect = {
	id: true,
	leaseId: true,
	tenantId: true,
	amount: true,
	currency: true,
	dueDate: true,
	paidAt: true,
	status: true,
	paymentMethod: true,
	provider: true,
	providerPaymentId: true,
	providerSessionId: true,
	providerStatus: true,
	failureReason: true,
	createdAt: true,
	updatedAt: true,
	tenant: { select: { id: true, name: true, avatar: true } },
	lease: {
		select: {
			id: true,
			room: {
				select: {
					id: true,
					roomNumber: true,
					name: true,
					unit: {
						select: {
							id: true,
							unitNumber: true,
							building: {
								select: {
									id: true,
									name: true,
									property: {
										select: {
											id: true,
											title: true,
											propertyType: true,
											city: true,
											country: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
} as const;

type PaymentRecord = Prisma.RentPaymentGetPayload<{
	select: typeof paymentSelect;
}>;

const isAdmin = (user: RequestUser) => user.roles.includes(AppRole.ADMIN);
const isOperator = (user: RequestUser) =>
	isAdmin(user) ||
	user.roles.includes(AppRole.OWNER) ||
	user.roles.includes(AppRole.TENANT);

const toNumber = (value: unknown): number => Number(value?.toString() ?? 0);

const toDto = (payment: PaymentRecord) => ({
	id: payment.id,
	leaseId: payment.leaseId,
	tenantId: payment.tenantId,
	amount: toNumber(payment.amount),
	currency: payment.currency,
	dueDate: payment.dueDate,
	paidAt: payment.paidAt,
	status: payment.status,
	paymentMethod: payment.paymentMethod,
	provider: payment.provider,
	providerPaymentId: payment.providerPaymentId,
	providerSessionId: payment.providerSessionId,
	providerStatus: payment.providerStatus,
	failureReason: payment.failureReason,
	createdAt: payment.createdAt,
	updatedAt: payment.updatedAt,
	tenant: payment.tenant,
	lease: payment.lease,
});

const toMinorUnits = (value: unknown): number => {
	const text = value?.toString() ?? "";
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment amount is invalid");
	}
	const [whole, fraction = ""] = text.split(".");
	const minor = Number(`${whole}${fraction.padEnd(2, "0")}`);
	if (!Number.isSafeInteger(minor) || minor <= 0) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment amount is invalid");
	}
	return minor;
};

const accessWhere = {
	lease: {
		status: {
			in: [LeaseStatus.ACTIVE, LeaseStatus.TERMINATED, LeaseStatus.EXPIRED],
		},
		deletedAt: null,
		tenant: { deletedAt: null },
		room: {
			deletedAt: null,
			unit: {
				deletedAt: null,
				building: { deletedAt: null, property: { deletedAt: null } },
			},
		},
	},
};

const createPayment = async (
	payload: TCreatePaymentPayload,
	user: RequestUser,
) => {
	if (!user.roles.includes(AppRole.TENANT)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can create payments",
		);
	}

	const existing = await paymentPrisma.rentPayment.findFirst({
		where: { idempotencyKey: payload.idempotencyKey },
		select: { id: true, providerPaymentId: true },
	});
	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Payment idempotency key was already used",
		);
	}

	const lease = await paymentPrisma.lease.findFirst({
		where: {
			id: payload.leaseId,
			tenantId: user.id,
			status: LeaseStatus.ACTIVE,
			deletedAt: null,
			tenant: { deletedAt: null },
			room: {
				deletedAt: null,
				unit: {
					deletedAt: null,
					building: { deletedAt: null, property: { deletedAt: null } },
				},
			},
		},
		select: { id: true, tenantId: true, monthlyRent: true },
	});
	if (!lease)
		throw new AppError(httpStatus.NOT_FOUND, "Eligible lease not found");

	const amountMinor = toMinorUnits(lease.monthlyRent);
	let payment: PaymentRecord;
	try {
		payment = await paymentPrisma.rentPayment.create({
			data: {
				leaseId: lease.id,
				tenantId: lease.tenantId,
				amount: lease.monthlyRent,
				currency: "BDT",
				dueDate: new Date(),
				status: RentPaymentStatus.PENDING,
				paymentMethod: "CARD",
				provider: PaymentProvider.STRIPE,
				idempotencyKey: payload.idempotencyKey,
			},
			select: paymentSelect,
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Payment idempotency key was already used",
			);
		}
		throw error;
	}

	try {
		const intent = await getStripe().paymentIntents.create(
			{
				amount: amountMinor,
				currency: "bdt",
				metadata: { paymentId: payment.id, leaseId: lease.id },
			},
			{ idempotencyKey: `rent-payment:${payment.id}` },
		);
		const updated = await paymentPrisma.rentPayment.update({
			where: { id: payment.id },
			data: {
				status: RentPaymentStatus.PROCESSING,
				providerPaymentId: intent.id,
				providerStatus: intent.status,
			},
			select: paymentSelect,
		});
		return { payment: toDto(updated), clientSecret: intent.client_secret };
	} catch (error) {
		await paymentPrisma.rentPayment.updateMany({
			where: { id: payment.id, status: RentPaymentStatus.PENDING },
			data: {
				status: RentPaymentStatus.FAILED,
				failureReason: "Stripe payment initialization failed",
			},
		});
		if (error instanceof AppError) throw error;
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"Unable to initialize Stripe payment",
		);
	}
};

const buildWhere = (
	query: TPaymentQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const conditions: Prisma.RentPaymentWhereInput[] = [accessWhere];
	if (scope.type === "tenant") conditions.push({ tenantId: scope.userId });
	if (scope.type === "managed" && !isAdmin(scope.user)) {
		conditions.push({
			lease: {
				room: {
					unit: {
						building: {
							property: {
								OR: [{ ownerId: scope.user.id }, { managerId: scope.user.id }],
							},
						},
					},
				},
			},
		});
	}
	if (query.status) conditions.push({ status: query.status });
	return { AND: conditions };
};

const listPayments = async (
	query: TPaymentQuery,
	scope:
		| { type: "tenant"; userId: string }
		| { type: "managed"; user: RequestUser },
) => {
	const where = buildWhere(query, scope);
	const orderBy = [
		{ [query.sortBy]: query.sortOrder },
		{ id: "asc" },
	] as Prisma.RentPaymentOrderByWithRelationInput[];
	const [data, total] = await paymentPrisma.$transaction([
		paymentPrisma.rentPayment.findMany({
			where,
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			orderBy,
			select: paymentSelect,
		}),
		paymentPrisma.rentPayment.count({ where }),
	]);
	return {
		data: data.map(toDto),
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPage: Math.ceil(total / query.limit),
		},
	};
};

const getMyPayments = async (query: TPaymentQuery, user: RequestUser) => {
	if (!user.roles.includes(AppRole.TENANT))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only tenants can access their payments",
		);
	return listPayments(query, { type: "tenant", userId: user.id });
};

const getManagedPayments = async (query: TPaymentQuery, user: RequestUser) => {
	if (!isOperator(user))
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to access payments",
		);
	return listPayments(query, { type: "managed", user });
};

const getPaymentForAccess = async (id: string) => {
	const payment = await paymentPrisma.rentPayment.findFirst({
		where: { ...accessWhere, id },
		select: {
			...paymentSelect,
			lease: {
				select: {
					...paymentSelect.lease.select,
					room: {
						select: {
							...paymentSelect.lease.select.room.select,
							unit: {
								select: {
									...paymentSelect.lease.select.room.select.unit.select,
									building: {
										select: {
											...paymentSelect.lease.select.room.select.unit.select
												.building.select,
											property: {
												select: {
													...paymentSelect.lease.select.room.select.unit.select
														.building.select.property.select,
													ownerId: true,
													managerId: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});
	if (!payment) throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	return payment as PaymentRecord;
};

const assertAccess = (payment: PaymentRecord, user: RequestUser) => {
	if (isAdmin(user)) return;
	const property = payment.lease.room.unit.building
		.property as PaymentRecord["lease"]["room"]["unit"]["building"]["property"] & {
		ownerId?: string;
		managerId?: string | null;
	};
	if (
		payment.tenantId === user.id ||
		property.ownerId === user.id ||
		property.managerId === user.id
	)
		return;
	throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
};

const getPaymentById = async (id: string, user: RequestUser) => {
	const payment = await getPaymentForAccess(id);
	assertAccess(payment, user);
	return toDto(payment);
};

const handleStripeWebhook = async (
	event: import("stripe").default.Event,
): Promise<boolean> => {
	if (
		event.type !== "payment_intent.succeeded" &&
		event.type !== "payment_intent.payment_failed"
	)
		return false;
	const intent = event.data.object as import("stripe").default.PaymentIntent;
	const paymentId = intent.metadata?.paymentId;
	if (!paymentId || !intent.id)
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Stripe payment metadata is invalid",
		);

	return paymentPrisma.$transaction(async (tx) => {
		try {
			await tx.stripeWebhookEvent.create({
				data: { stripeEventId: event.id, eventType: event.type },
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			)
				return false;
			throw error;
		}

		const payment = await tx.rentPayment.findFirst({
			where: {
				id: paymentId,
				providerPaymentId: intent.id,
				provider: PaymentProvider.STRIPE,
			},
			select: { id: true, amount: true, currency: true, status: true },
		});
		if (!payment)
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Stripe payment does not match a local payment",
			);
		if (
			payment.currency !== "BDT" ||
			intent.currency !== "bdt" ||
			toMinorUnits(payment.amount) !== intent.amount
		)
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Stripe payment integrity check failed",
			);

		await tx.rentPayment.update({
			where: { id: payment.id },
			data: {
				status:
					event.type === "payment_intent.succeeded"
						? RentPaymentStatus.PAID
						: RentPaymentStatus.FAILED,
				paidAt:
					event.type === "payment_intent.succeeded" ? new Date() : undefined,
				providerStatus: intent.status,
				failureReason:
					event.type === "payment_intent.payment_failed"
						? (intent.last_payment_error?.message ?? "Stripe payment failed")
						: null,
				gatewayResponse: JSON.parse(
					JSON.stringify(event),
				) as Prisma.InputJsonValue,
			},
		});
		return true;
	});
};

export const PaymentServices = {
	createPayment,
	getMyPayments,
	getManagedPayments,
	getPaymentById,
	handleStripeWebhook,
};
