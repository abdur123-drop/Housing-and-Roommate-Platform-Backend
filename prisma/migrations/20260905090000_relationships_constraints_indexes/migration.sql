-- =============================================================================
-- Step 3: Relationships, Constraints & Indexes
--
--   1. FK delete-behaviour fixes on workflow/financial history
--   2. Soft-delete-aware PARTIAL unique indexes
--   3. Business CHECK constraints for impossible states
--   4. Composite indexes + removal of redundant single-column indexes
--
-- NON-DESTRUCTIVE: no table is dropped, renamed or truncated; no row is
-- deleted. Only constraints and indexes change.
--
-- Migrations 20260904120000_init and 20260904190000_* are NOT touched.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. FOREIGN-KEY DELETE BEHAVIOUR
--
-- Four relationships were CASCADE but point at records that are business
-- history. A hard delete of the parent silently destroyed them.
--
--   viewing_requests.user_id      CASCADE -> RESTRICT  (who asked to view what)
--   viewing_requests.property_id  CASCADE -> RESTRICT
--   maintenance_requests.property_id CASCADE -> RESTRICT (repair history)
--   utility_bill_splits.bill_id   CASCADE -> RESTRICT  (tenant's obligation)
--
-- Everything else was already correct and is left alone. In particular the
-- property -> building -> unit -> room hierarchy stays CASCADE: those children
-- have no meaning without their parent, and the financial leaves hanging off
-- rooms (applications, leases) are RESTRICT, so a property with any rental
-- history cannot be hard-deleted anyway.
-- -----------------------------------------------------------------------------
ALTER TABLE "viewing_requests" DROP CONSTRAINT "viewing_requests_user_id_fkey";
ALTER TABLE "viewing_requests" ADD CONSTRAINT "viewing_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "viewing_requests" DROP CONSTRAINT "viewing_requests_property_id_fkey";
ALTER TABLE "viewing_requests" ADD CONSTRAINT "viewing_requests_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests" DROP CONSTRAINT "maintenance_requests_property_id_fkey";
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "utility_bill_splits" DROP CONSTRAINT "utility_bill_splits_bill_id_fkey";
ALTER TABLE "utility_bill_splits" ADD CONSTRAINT "utility_bill_splits_bill_id_fkey"
    FOREIGN KEY ("bill_id") REFERENCES "utility_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- 2. SOFT-DELETE-AWARE UNIQUE INDEXES
--
-- A plain UNIQUE keeps a soft-deleted row's key reserved forever: you could
-- never re-create a building called "Block A" after deleting one. Each of these
-- is replaced by a PARTIAL unique index scoped to live rows.
--
-- The old index is dropped and the partial one created inside this single
-- transaction, so uniqueness is never unenforced.
--
-- Prisma cannot express partial indexes; the corresponding @unique/@@unique
-- attributes were removed from the schema so it will not recreate the full
-- versions. Verified: `prisma migrate diff` does NOT try to drop these.
-- -----------------------------------------------------------------------------

-- users.email -- a deleted account releases its address for re-registration.
-- Look users up with findFirst({ email, deletedAt: null }), never findUnique.
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_active_key"
    ON "users" ("email") WHERE "deleted_at" IS NULL;

-- Building names are unique within a property, never globally.
DROP INDEX "buildings_property_id_name_key";
CREATE UNIQUE INDEX "buildings_property_id_name_active_key"
    ON "buildings" ("property_id", "name") WHERE "deleted_at" IS NULL;

-- "A-101" may legitimately exist in many buildings.
DROP INDEX "units_building_id_unit_number_key";
CREATE UNIQUE INDEX "units_building_id_unit_number_active_key"
    ON "units" ("building_id", "unit_number") WHERE "deleted_at" IS NULL;

-- Room "101" may legitimately exist in many units.
DROP INDEX "rooms_unit_id_room_number_key";
CREATE UNIQUE INDEX "rooms_unit_id_room_number_active_key"
    ON "rooms" ("unit_id", "room_number") WHERE "deleted_at" IS NULL;

-- A retired preference frees its name for reuse.
DROP INDEX "preferences_name_key";
CREATE UNIQUE INDEX "preferences_name_active_key"
    ON "preferences" ("name") WHERE "deleted_at" IS NULL;

-- NEW: properties had no name constraint at all. One owner cannot list the same
-- title twice; different owners may reuse a title. Titles are deliberately NOT
-- globally unique.
CREATE UNIQUE INDEX "properties_owner_id_title_active_key"
    ON "properties" ("owner_id", "title") WHERE "deleted_at" IS NULL;

-- Unique constraints intentionally left FULL (documented, not an oversight):
--   roles.name                      -- no soft delete; guarded by roles_name_allowed
--   user_roles (user_id, role_id)   -- composite PK
--   user_preferences (...)          -- composite PK
--   roommate_profiles.user_id       -- Prisma requires it for the 1:1 relation;
--                                      restore a soft-deleted profile, don't duplicate
--   leases.application_id           -- one application yields at most one lease, ever
--   rent_payments.transaction_id    -- financial, table has no soft delete
--   rent_payments.provider_payment_id / provider_session_id -- Stripe idempotency
--   utility_bill_splits (bill_id, tenant_id) -- financial, no soft delete


-- -----------------------------------------------------------------------------
-- 3. CHECK CONSTRAINTS -- impossible states only, no workflow rules
-- -----------------------------------------------------------------------------

-- Date ranges cannot run backwards.
ALTER TABLE "room_availability" ADD CONSTRAINT "room_availability_date_range_check"
    CHECK ("available_to" IS NULL OR "available_from" <= "available_to");

ALTER TABLE "leases" ADD CONSTRAINT "leases_date_range_check"
    CHECK ("end_date" IS NULL OR "start_date" <= "end_date");

ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_period_check"
    CHECK ("billing_period_start" <= "billing_period_end");

-- Money is never negative.
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_amounts_check"
    CHECK ("monthly_rent" >= 0 AND "security_deposit" >= 0);

ALTER TABLE "leases" ADD CONSTRAINT "leases_amounts_check"
    CHECK ("monthly_rent" >= 0 AND "security_deposit" >= 0);

ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_amount_check"
    CHECK ("amount" >= 0);

-- Refund amount is only sanity-checked for sign. Whether a refund may exceed the
-- original charge is a Stripe/business question and belongs in the service layer.
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_refund_check"
    CHECK ("refunded_amount" IS NULL OR "refunded_amount" >= 0);

ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_total_check"
    CHECK ("total_amount" >= 0);

ALTER TABLE "utility_bill_splits" ADD CONSTRAINT "utility_bill_splits_amount_check"
    CHECK ("amount" >= 0);

-- Counts are never negative.
ALTER TABLE "units" ADD CONSTRAINT "units_counts_check"
    CHECK ("bedrooms" >= 0 AND "bathrooms" >= 0);

-- Budget range is coherent and non-negative.
ALTER TABLE "roommate_profiles" ADD CONSTRAINT "roommate_profiles_budget_check"
    CHECK (
        ("budget_min" IS NULL OR "budget_min" >= 0)
        AND ("budget_max" IS NULL OR "budget_max" >= 0)
        AND ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max")
    );

-- Coordinates are physically possible.
ALTER TABLE "properties" ADD CONSTRAINT "properties_coordinates_check"
    CHECK (
        ("latitude"  IS NULL OR ("latitude"  >= -90  AND "latitude"  <= 90))
        AND ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180))
    );


-- -----------------------------------------------------------------------------
-- 4. INDEXES
--
-- Composite indexes for the real multi-column access paths, each replacing the
-- single-column index it subsumes (leading column = the old index), so no write
-- amplification is added.
-- -----------------------------------------------------------------------------
DROP INDEX "rooms_unit_id_idx";
CREATE INDEX "rooms_unit_id_status_idx" ON "rooms"("unit_id", "status");

DROP INDEX "room_availability_room_id_idx";
CREATE INDEX "room_availability_room_id_status_available_from_idx"
    ON "room_availability"("room_id", "status", "available_from");

DROP INDEX "applications_room_id_idx";
CREATE INDEX "applications_room_id_status_idx" ON "applications"("room_id", "status");

DROP INDEX "leases_room_id_idx";
CREATE INDEX "leases_room_id_status_idx" ON "leases"("room_id", "status");

DROP INDEX "rent_payments_tenant_id_idx";
CREATE INDEX "rent_payments_tenant_id_status_due_date_idx"
    ON "rent_payments"("tenant_id", "status", "due_date");

DROP INDEX "maintenance_requests_property_id_idx";
CREATE INDEX "maintenance_requests_property_id_status_idx"
    ON "maintenance_requests"("property_id", "status");

-- Redundant: the (bill_id, tenant_id) unique already serves bill_id lookups.
DROP INDEX "utility_bill_splits_bill_id_idx";

-- Public property search: "published properties in this city", live rows only.
CREATE INDEX "properties_status_city_active_idx"
    ON "properties" ("status", "city") WHERE "deleted_at" IS NULL;
