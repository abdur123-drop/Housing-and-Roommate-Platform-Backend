-- Step 9: tenants can choose whether their roommate profile appears in discovery.
ALTER TABLE "roommate_profiles"
    ADD COLUMN "is_discoverable" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "roommate_profiles_discovery_idx"
    ON "roommate_profiles" ("is_discoverable", "deleted_at", "preferred_location");
