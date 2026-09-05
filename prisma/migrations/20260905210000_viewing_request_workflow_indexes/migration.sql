-- Step 11: duplicate/concurrency protection for active viewing requests.
-- Same tenant + same room + same requested datetime may only be pending once.
CREATE UNIQUE INDEX "viewing_requests_user_room_datetime_pending_key"
    ON "viewing_requests" ("user_id", "room_id", "requested_date", COALESCE("requested_time", ''))
    WHERE "deleted_at" IS NULL AND "status" = 'PENDING' AND "room_id" IS NOT NULL;

-- Same tenant + same property-only requested datetime may only be pending once.
CREATE UNIQUE INDEX "viewing_requests_user_property_datetime_pending_key"
    ON "viewing_requests" ("user_id", "property_id", "requested_date", COALESCE("requested_time", ''))
    WHERE "deleted_at" IS NULL AND "status" = 'PENDING' AND "room_id" IS NULL;

CREATE INDEX "viewing_requests_property_status_requested_date_idx"
    ON "viewing_requests" ("property_id", "status", "requested_date")
    WHERE "deleted_at" IS NULL;
