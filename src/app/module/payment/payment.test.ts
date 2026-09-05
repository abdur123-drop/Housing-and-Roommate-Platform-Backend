import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	PaymentProvider,
	Prisma,
	RentPaymentStatus,
} from "../../../generated/prisma/client";
import { AppRole } from "../../constants/roles";
import {
	resetStripeForTest,
	setStripeForTest,
	setStripeWebhookSecretForTest,
} from "../../lib/stripe";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	PaymentServices,
	resetPaymentPrismaForTest,
	setPaymentPrismaForTest,
} from "./payment.service";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const tenant: RequestUser = {
	id: "11111111-1111-4111-8111-111111111111",
	userId: "11111111-1111-4111-8111-111111111111",
	email: "tenant@example.com",
	roles: [AppRole.TENANT],
};
const leaseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const paymentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const paymentIntentId = "pi_test_123";
const now = new Date("2026-09-05T00:00:00.000Z");

const paymentRecord = {
	id: paymentId,
	leaseId,
	tenantId: tenant.id,
	amount: "1500.00",
	currency: "BDT",
	dueDate: now,
	paidAt: null,
	status: RentPaymentStatus.PROCESSING,
	paymentMethod: "CARD",
	provider: PaymentProvider.STRIPE,
	providerPaymentId: paymentIntentId,
	providerSessionId: null,
	providerStatus: "requires_payment_method",
	failureReason: null,
	createdAt: now,
	updatedAt: now,
	tenant: { id: tenant.id, name: "Tenant", avatar: null },
	lease: {
		id: leaseId,
		room: {
			id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			roomNumber: "101",
			name: "Blue room",
			unit: {
				id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				unitNumber: "A-1",
				building: {
					id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
					name: "Tower A",
					property: {
						id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
						title: "Lake View",
						propertyType: "APARTMENT",
						city: "Dhaka",
						country: "Bangladesh",
					},
				},
			},
		},
	},
};

const setDb = (db: unknown) => {
	setPaymentPrismaForTest(db as Parameters<typeof setPaymentPrismaForTest>[0]);
};

const expectAppError = async (
	fn: () => Promise<unknown>,
	statusCode: number,
) => {
	await assert.rejects(
		fn,
		(error) => error instanceof AppError && error.statusCode === statusCode,
	);
};

afterEach(() => {
	resetPaymentPrismaForTest();
	resetStripeForTest();
});

describe("payment creation", () => {
	it("derives amount and BDT currency from the active lease", async () => {
		let createArgs: { data: Record<string, unknown> } | undefined;
		let stripeArgs: { amount: number; currency: string } | undefined;
		setDb({
			rentPayment: {
				findFirst: async () => null,
				create: async (args: { data: Record<string, unknown> }) => {
					createArgs = args;
					return {
						...paymentRecord,
						status: RentPaymentStatus.PENDING,
						providerPaymentId: null,
					};
				},
				update: async () => paymentRecord,
				updateMany: async () => ({ count: 0 }),
			},
			lease: {
				findFirst: async () => ({
					id: leaseId,
					tenantId: tenant.id,
					monthlyRent: "1500.00",
				}),
			},
		});
		setStripeForTest({
			paymentIntents: {
				create: async (args: { amount: number; currency: string }) => {
					stripeArgs = args;
					return {
						id: paymentIntentId,
						status: "requires_payment_method",
						client_secret: "secret_test",
					};
				},
			},
		} as never);

		const result = await PaymentServices.createPayment(
			{ leaseId, idempotencyKey: "request-1" },
			tenant,
		);
		assert.equal(createArgs?.data.currency, "BDT");
		assert.equal(createArgs?.data.amount, "1500.00");
		assert.equal(stripeArgs?.amount, 150000);
		assert.equal(stripeArgs?.currency, "bdt");
		assert.equal(result.clientSecret, "secret_test");
	});

	it("does not allow tenants to pay another tenant's lease", async () => {
		setDb({
			lease: { findFirst: async () => null },
			rentPayment: { findFirst: async () => null },
		});
		await expectAppError(
			() =>
				PaymentServices.createPayment(
					{ leaseId, idempotencyKey: "request-2" },
					tenant,
				),
			404,
		);
	});

	it("rejects repeated local idempotency keys", async () => {
		setDb({ rentPayment: { findFirst: async () => ({ id: paymentId }) } });
		await expectAppError(
			() =>
				PaymentServices.createPayment(
					{ leaseId, idempotencyKey: "request-1" },
					tenant,
				),
			409,
		);
	});
});

describe("payment validation and webhook synchronization", () => {
	it("rejects an invalid Stripe webhook signature at the HTTP boundary", async () => {
		setStripeWebhookSecretForTest("whsec_test");
		const next = await new Promise<unknown>((resolve) => {
			PaymentController.stripeWebhook(
				{ body: Buffer.from("{}"), header: () => undefined } as never,
				{} as never,
				(error: unknown) => resolve(error),
			);
		});
		assert.equal((next as AppError).statusCode, 400);
	});

	it("rejects client amount, currency, and status fields", () => {
		const result = PaymentValidation.CreatePaymentZodSchema.safeParse({
			leaseId,
			amount: 1,
			currency: "USD",
			status: "PAID",
		});
		assert.equal(result.success, false);
	});

	it("marks a verified matching Stripe success as paid", async () => {
		let updateArgs: { data: Record<string, unknown> } | undefined;
		setDb({
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					stripeWebhookEvent: { create: async () => ({ id: "event-row" }) },
					rentPayment: {
						findFirst: async () => ({
							id: paymentId,
							amount: "1500.00",
							currency: "BDT",
							status: RentPaymentStatus.PROCESSING,
						}),
						update: async (args: { data: Record<string, unknown> }) => {
							updateArgs = args;
							return paymentRecord;
						},
					},
				}),
		});
		const processed = await PaymentServices.handleStripeWebhook({
			id: "evt_test_1",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: paymentIntentId,
					amount: 150000,
					currency: "bdt",
					status: "succeeded",
					metadata: { paymentId },
				},
			},
		} as never);
		assert.equal(processed, true);
		assert.equal(updateArgs?.data.status, RentPaymentStatus.PAID);
	});

	it("ignores a duplicate Stripe event through the unique event ledger", async () => {
		let seen = false;
		setDb({
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					stripeWebhookEvent: {
						create: async () => {
							if (seen) {
								throw new Prisma.PrismaClientKnownRequestError("duplicate", {
									code: "P2002",
									clientVersion: "test",
								});
							}
							seen = true;
							return { id: "event-row" };
						},
					},
					rentPayment: {
						findFirst: async () => ({ id: paymentId, amount: "1500.00", currency: "BDT" }),
						update: async () => paymentRecord,
					},
				}),
		});
		const event = {
			id: "evt_duplicate",
			type: "payment_intent.succeeded",
			data: { object: { id: paymentIntentId, amount: 150000, currency: "bdt", status: "succeeded", metadata: { paymentId } } },
		} as never;
		assert.equal(await PaymentServices.handleStripeWebhook(event), true);
		assert.equal(await PaymentServices.handleStripeWebhook(event), false);
	});

	it("rejects a webhook with a mismatched amount", async () => {
		setDb({
			$transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					stripeWebhookEvent: { create: async () => ({ id: "event-row" }) },
					rentPayment: {
						findFirst: async () => ({
							id: paymentId,
							amount: "1500.00",
							currency: "BDT",
						}),
					},
				}),
		});
		await expectAppError(
			() =>
				PaymentServices.handleStripeWebhook({
					id: "evt_test_2",
					type: "payment_intent.succeeded",
					data: {
						object: {
							id: paymentIntentId,
							amount: 1,
							currency: "bdt",
							metadata: { paymentId },
						},
					},
				} as never),
			400,
		);
	});
});
