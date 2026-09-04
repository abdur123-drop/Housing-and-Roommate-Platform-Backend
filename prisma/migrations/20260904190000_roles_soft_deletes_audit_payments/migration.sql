-- =============================================================================
-- Step 2: Database Foundation
--   1. Normalize roles to exactly OWNER / TENANT / ADMIN
--   2. Soft deletes (deleted_at) on domain entities
--   3. audit_logs table (append-only)
--   4. Payment-provider fields on rent_payments
--
-- The already-applied 20260904120000_init migration is NOT touched.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ROLE NORMALIZATION
--
-- Drops PROPERTY_MANAGER and ROOMMATE, which are no longer primary RBAC roles:
--   * a roommate is a TENANT that also has a `roommate_profiles` row;
--   * a property manager is the user in `properties.manager_id` for one
--     specific property, authorized at the resource level.
--
-- SAFETY: if any user is still assigned one of these roles, this migration
-- ABORTS rather than silently deleting or reassigning real user data. Resolve
-- the assignments by hand, then re-run.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    stale_refs integer;
    offending  text;
BEGIN
    SELECT count(*), string_agg(DISTINCT r."name", ', ')
      INTO stale_refs, offending
      FROM "user_roles" ur
      JOIN "roles" r ON r."id" = ur."role_id"
     WHERE r."name" IN ('PROPERTY_MANAGER', 'ROOMMATE');

    IF stale_refs > 0 THEN
        RAISE EXCEPTION
            'Migration aborted: % user_roles row(s) still reference removed role(s): %. '
            'No data was changed. Reassign these users first - roommates become TENANT '
            '(plus a roommate_profiles row), managers become the properties.manager_id '
            'of the property they manage - then re-run this migration.',
            stale_refs, offending;
    END IF;

    DELETE FROM "roles" WHERE "name" IN ('PROPERTY_MANAGER', 'ROOMMATE');
END $$;

-- Enforce the three-role set at the database level so no seed, script, or
-- future code path can reintroduce a fourth primary role.
ALTER TABLE "roles"
    ADD CONSTRAINT "roles_name_allowed"
    CHECK ("name" IN ('OWNER', 'TENANT', 'ADMIN'));


-- -----------------------------------------------------------------------------
-- 2. PAYMENT ENUMS
--
-- Real providers only - there is deliberately no MANUAL/FAKE member.
-- -----------------------------------------------------------------------------
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'BKASH', 'SSLCOMMERZ');

-- PROCESSING: handed to the provider, awaiting the settling webhook.
-- REFUNDED / CANCELLED: how a financial row is retired, since rent_payments is
-- history and is never hard- or soft-deleted.
-- (ALTER TYPE ... ADD VALUE is transaction-safe on PostgreSQL 12+ as long as
-- the new values are not used in this same migration. They are not.)
ALTER TYPE "RentPaymentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RentPaymentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "RentPaymentStatus" ADD VALUE 'CANCELLED';


-- -----------------------------------------------------------------------------
-- 3. SOFT DELETES
--
-- Added to domain entities only. Deliberately NOT added to:
--   * rent_payments, utility_bills, utility_bill_splits -> financial history,
--     retired via status instead;
--   * audit_logs -> immutable;
--   * roles / user_roles / user_preferences -> fixed lookup + join rows.
-- -----------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "properties" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "buildings" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "units" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "rooms" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "room_availability" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "roommate_profiles" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "preferences" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "viewing_requests" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "applications" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "leases" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "maintenance_requests" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "properties_deleted_at_idx" ON "properties"("deleted_at");


-- -----------------------------------------------------------------------------
-- 4. PAYMENT-PROVIDER FIELDS ON rent_payments
--
-- All provider columns are nullable: a rent_payments row exists from the moment
-- rent falls due, long before any provider interaction.
-- `updated_at` carries DEFAULT CURRENT_TIMESTAMP so the NOT NULL is safe to add
-- to a table that already holds rows in any environment.
-- -----------------------------------------------------------------------------
ALTER TABLE "rent_payments"
    ADD COLUMN "currency"             CHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN "provider"             "PaymentProvider",
    ADD COLUMN "provider_payment_id"  TEXT,
    ADD COLUMN "provider_session_id"  TEXT,
    ADD COLUMN "provider_customer_id" TEXT,
    ADD COLUMN "provider_status"      TEXT,
    ADD COLUMN "gateway_response"     JSONB,
    ADD COLUMN "failure_reason"       TEXT,
    ADD COLUMN "refunded_amount"      DECIMAL(12,2),
    ADD COLUMN "refund_reason"        TEXT,
    ADD COLUMN "refunded_at"          TIMESTAMPTZ(6),
    ADD COLUMN "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- UNIQUE on the provider ids is the webhook idempotency guard: a replayed
-- provider event cannot settle a second row.
CREATE UNIQUE INDEX "rent_payments_provider_payment_id_key" ON "rent_payments"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payments_provider_session_id_key" ON "rent_payments"("provider_session_id");

-- CreateIndex
CREATE INDEX "rent_payments_provider_idx" ON "rent_payments"("provider");


-- -----------------------------------------------------------------------------
-- 5. AUDIT LOGS (append-only; no deleted_at, no updated_at)
--
-- actor_user_id is nullable for system/cron/webhook-generated actions, and uses
-- ON DELETE SET NULL so removing a user never destroys the audit trail.
-- -----------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
