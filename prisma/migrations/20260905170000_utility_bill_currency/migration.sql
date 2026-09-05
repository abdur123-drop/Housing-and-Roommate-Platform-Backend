-- Step 15: utility bills use the platform's BDT currency.
ALTER TABLE "utility_bills"
    ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'BDT';