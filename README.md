# PH-6 Housing & Roommate Matching Platform — Backend

Property Rental + Roommate Matching platform API. Express 5 + PostgreSQL + Prisma 7,
structured to match `L2B7-Project-PH-Healthcare-Backend`.

## Stack

- Express 5, TypeScript (ESM)
- PostgreSQL 15+ via Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`)
- Zod validation, JWT auth, bcrypt

## Getting started

```bash
pnpm install
cp .env.example .env      # fill in DATABASE_URL and the JWT secrets
pnpm prisma:generate
pnpm migrate:deploy       # or `pnpm migrate:dev` while developing
pnpm dev
```

The five roles (`OWNER`, `TENANT`, `ROOMMATE`, `PROPERTY_MANAGER`, `ADMIN`) are
seeded idempotently on every boot from `src/app/utils/seed.ts`. An optional
platform admin is seeded when `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`
are set.

## Layout

```
prisma/
  schema/            # multi-file Prisma schema, split by domain
    schema.prisma    # generator + datasource
    enums.prisma
    user.prisma      # users, roles, user_roles
    property.prisma  # properties, buildings, units, rooms, room_availability
    roommate.prisma  # roommate_profiles, preferences, user_preferences
    rental.prisma    # viewing_requests, applications, leases
    billing.prisma   # rent_payments, utility_bills, utility_bill_splits
    maintenance.prisma
  migrations/
src/
  app/
    config/          # env access
    constants/       # role names
    interfaces/
    lib/prisma.ts    # PrismaClient singleton
    middleware/      # checkAuth, validateRequest, globalErrorHandler, notFound
    module/          # <feature>/<feature>.{route,controller,service,validation}.ts
    utils/           # AppError, catchAsync, sendResponse, jwt, seed
  app.ts
  server.ts
```

## Domain model

```
users -> properties -> buildings -> units -> rooms -> room_availability
users -> viewing_requests -> applications -> leases -> rent_payments
users -> roommate_profiles / user_preferences -> preferences
properties -> utility_bills -> utility_bill_splits
properties -> maintenance_requests
```

### Conventions

- UUID primary keys (`@db.Uuid`), snake_case tables and columns via `@map` / `@@map`
- Money is `DECIMAL(12,2)` — never floating point
- Timestamps are `TIMESTAMPTZ(6)`
- Roles live in a `roles` table (not an enum) so a user can hold several at once

### Concurrency: no double-booked rooms

`leases` carries a partial unique index that Prisma cannot express, added by
hand in `prisma/migrations/20260904120000_init/migration.sql`:

```sql
CREATE UNIQUE INDEX "leases_room_id_active_key"
    ON "leases" ("room_id")
    WHERE "status" = 'ACTIVE';
```

Two concurrent approvals for the same room cannot both produce an `ACTIVE`
lease — the loser gets a unique violation (`P2002`). Service code should still
wrap approve-application → create-lease in a `prisma.$transaction` and lock the
room row (`SELECT ... FOR UPDATE`) so the losing request fails cleanly.

**If you regenerate the initial migration, re-add that index by hand.**
