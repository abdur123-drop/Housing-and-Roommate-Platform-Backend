-- Step 12: a tenant may only have one active pending application per room.
CREATE UNIQUE INDEX "applications_user_room_pending_key"
    ON "applications" ("user_id", "room_id")
    WHERE "deleted_at" IS NULL AND "status" = 'PENDING';

CREATE INDEX "applications_status_submitted_at_idx"
    ON "applications" ("status", "submitted_at")
    WHERE "deleted_at" IS NULL;
