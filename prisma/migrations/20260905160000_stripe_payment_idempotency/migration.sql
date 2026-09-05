-- Step 14: Stripe payment idempotency and webhook ledger.
ALTER TABLE "rent_payments"
    ALTER COLUMN "currency" SET DEFAULT 'BDT';

ALTER TABLE "rent_payments"
    ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "rent_payments_idempotency_key_key"
    ON "rent_payments"("idempotency_key");

CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_key"
    ON "stripe_webhook_events"("stripe_event_id");

CREATE INDEX "stripe_webhook_events_event_type_idx"
    ON "stripe_webhook_events"("event_type");
