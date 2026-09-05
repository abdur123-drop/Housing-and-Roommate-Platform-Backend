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

The three primary roles (`OWNER`, `TENANT`, `ADMIN`) are seeded idempotently on
every boot from `src/app/utils/seed.ts`. A roommate is a tenant with a roommate
profile and preferences; a property manager is a user assigned through
`properties.manager_id`. Neither is a role. An optional platform admin is seeded
when `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` are set.

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

## Step 9 Roommate API

Tenant-only profile management:

- `POST /api/v1/roommate-profile`
- `GET /api/v1/roommate-profile/me`
- `PATCH /api/v1/roommate-profile/me`
- `DELETE /api/v1/roommate-profile/me`

Roommate preferences:

- `GET /api/v1/roommate-preferences/me`
- `PUT /api/v1/roommate-preferences/me`
- `GET /api/v1/preferences`
- `POST /api/v1/preferences` / `PATCH /api/v1/preferences/:id` /
  `DELETE /api/v1/preferences/:id` for admins

Discovery and matching:

- `GET /api/v1/roommates`
- `GET /api/v1/roommates/:id`
- `GET /api/v1/roommates/matches`

Discovery only returns active users with active, discoverable roommate profiles.
It excludes the requesting tenant and never returns password, phone, refresh
token, audit, or other internal user data. Profile ownership always comes from
the authenticated user, never from client-provided `userId`.

Compatibility scores are deterministic integers from 0 to 100. The formula is:
budget 30%, preferred location 20%, move-in date 15%, lifestyle 20% (`smoking`,
`pets`, and the existing `genderPreference` field as a soft same-value signal),
and reusable preferences 15%. Missing dimensions are ignored and the remaining
available weights are normalized; if no comparable dimensions exist, the neutral
score is 50. Matching is calculated after database filtering and sorts the
scored candidate window by compatibility.

## Step 10 Property Search

Public search uses the existing endpoint:

```http
GET /api/v1/properties
```

Supported filters:

- `search`: case-insensitive contains match across `title`, `description`,
  `address`, `city`, `state`, `country`, and `zipCode`.
- `propertyType`: exact Prisma enum value such as `APARTMENT`, `HOUSE`,
  `BUILDING`, `CONDO`, `VILLA`, or `OTHER`.
- `city`, `state`, `country`: case-insensitive exact text filters.
- `minPrice`, `maxPrice`: properties with at least one active, non-deleted room
  whose `monthlyRent` falls inside the requested range.
- `availableFrom`, `availableTo`: properties with at least one active room whose
  non-deleted `AVAILABLE` availability intersects the requested half-open range
  using `existing.availableFrom < requestedTo` and
  `existing.availableTo > requestedFrom` when both sides exist.

Pagination defaults to `page=1&limit=10`, caps `limit` at `100`, and returns the
standard metadata: `page`, `limit`, `total`, and `totalPage`. Sorting is
whitelisted to `createdAt`, `updatedAt`, `title`, `city`, `state`, `country`,
`propertyType`, and `status`; every sort also adds `id ASC` as a deterministic
secondary order for stable pagination.

Public results only include `PUBLISHED`, non-deleted properties and never expose
`ownerId`, `managerId`, contact credentials, audit data, `deletedAt`, or raw
Prisma objects. Availability and room summaries exclude deleted buildings,
units, rooms, and availability rows.

## Step 11 Viewing Requests

Viewing request endpoints:

- `POST /api/v1/viewing-requests`
- `GET /api/v1/viewing-requests/my-requests`
- `GET /api/v1/viewing-requests/managed`
- `GET /api/v1/properties/:propertyId/viewing-requests`
- `GET /api/v1/viewing-requests/:id`
- `PATCH /api/v1/viewing-requests/:id/approve`
- `PATCH /api/v1/viewing-requests/:id/reject`
- `PATCH /api/v1/viewing-requests/:id/cancel`

Only tenants create normal viewing requests. The server derives `userId` from
the authenticated user and derives `propertyId` through
`room -> unit -> building -> property`; client-supplied ownership/status fields
are rejected. Rooms must be active, non-deleted, under a published property, and
the requested viewing timestamp must be in the future and inside an active,
non-deleted `AVAILABLE` room availability interval using half-open semantics:
`availableFrom <= requestedDate` and `availableTo > requestedDate` when
`availableTo` exists.

Lifecycle is server-controlled:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELLED
```

`APPROVED`, `REJECTED`, `CANCELLED`, and `COMPLETED` are treated as terminal for
normal Step 11 operations. Owners and assigned property managers can approve or
reject requests for their property; tenants can cancel only their own pending
requests; admins have explicit global access. Status transitions use an atomic
`updateMany` condition requiring `status=PENDING`, so concurrent processing only
allows one transition to win. Viewing requests are private and never appear in
public property search/detail responses.

## Step 12 Applications

Applications are the separate workflow for telling an owner or assigned property
manager that a tenant wants to rent a room. They do not create a lease, reserve
the room, change occupancy, charge a fee, or send notifications.

Endpoints:

- `POST /api/v1/applications` (tenant only)
- `GET /api/v1/applications/my-applications` (the authenticated tenant only)
- `GET /api/v1/applications/managed` (owner, assigned manager, or admin)
- `GET /api/v1/properties/:propertyId/applications` (owner, assigned manager, or admin)
- `GET /api/v1/applications/:id` (the tenant, property owner, assigned manager, or admin)
- `PATCH /api/v1/applications/:id/approve` (property owner, assigned manager, or admin)
- `PATCH /api/v1/applications/:id/reject` (property owner, assigned manager, or admin)
- `PATCH /api/v1/applications/:id/withdraw` (the owning tenant)

Application creation accepts `roomId`, an optional `message`, and an optional
`viewingRequestId`. The server derives the tenant from authentication and the
property through `room -> unit -> building -> property`. The room and every
parent must be active, the property must be published, the room must be
available, and it must have a non-deleted `AVAILABLE` room-availability row.
Applications do not require an approved viewing request, but a supplied viewing
request must belong to the tenant and room and be approved. No move-in date is
stored by the current Application model, so availability is checked at room
eligibility time rather than against an invented application date.

The lifecycle is server-controlled:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> WITHDRAWN
```

Approved, rejected, and withdrawn applications are terminal. A tenant may submit
again after a rejected or withdrawn application, but only one non-deleted pending
application may exist for the same tenant and room. This is enforced both in the
service and by the PostgreSQL partial unique index
`applications_user_room_pending_key`; concurrent duplicates return `409 Conflict`.
Approval, rejection, and withdrawal use an atomic pending-state update, so only
one concurrent transition succeeds. Listings support `page`, `limit` (maximum
100), `status`, `propertyId`, `roomId`, `from`, `to`, `sortBy`, and `sortOrder`.
Sorting is whitelisted and deterministic. Normal queries exclude soft-deleted
applications and deleted parent resources, and application DTOs select only
the fields needed by the authenticated workflow.

## Step 13 Leases

A lease represents an actual occupancy agreement created from an approved
application. Application approval does not create a lease, and a lease is not a
payment, booking, reservation, or notification workflow.

Endpoints:

- `POST /api/v1/leases` (property owner, assigned manager, or admin)
- `GET /api/v1/leases/my-leases` (authenticated tenant's leases)
- `GET /api/v1/leases/managed` (owner, assigned manager, or admin)
- `GET /api/v1/leases/:id` (owning tenant, property owner, assigned manager, or admin)
- `POST /api/v1/leases/:id/terminate` (property owner, assigned manager, or admin)

Lease creation accepts only `applicationId`, `startDate`, and an optional
`endDate`. The server derives the tenant, room, property, rent, and deposit from
the approved application and its room hierarchy. The application, tenant, room,
unit, building, and property must be active; the room must still be available.
Dates use the existing inclusive database check (`startDate <= endDate`), while
the API requires `startDate < endDate` when an end date is supplied.

New leases are created as `ACTIVE`. `ACTIVE -> TERMINATED` is the only explicit
lifecycle action currently exposed. Historical `EXPIRED` and `TERMINATED`
records remain available to authorized users, while soft-deleted leases and
deleted parent resources are excluded from normal access.

Double booking is prevented by defense in depth. Creation runs in a Prisma
interactive transaction, acquires a room-scoped PostgreSQL advisory transaction
lock using `hashtextextended(roomId, 0)`, re-checks for a live `ACTIVE` lease,
and then creates the lease. The existing partial unique index
`leases_room_id_active_key` remains the database guarantee that only one active
lease can exist for a room; any unique conflict is returned as `409 Conflict`.
Different rooms do not share the lock. Lease listings support `page`, `limit`
(maximum 100), `status`, `propertyId`, `roomId`, `tenantId` for managed queries,
`from`, `to`, `sortBy`, and `sortOrder`. Sorting is whitelisted and pagination
and filtering happen in the database.

## Step 14 Stripe Payments

Rent payments use Stripe PaymentIntents and BDT only. The tenant starts a payment
with `POST /api/v1/payments`, providing only `leaseId` and an
`Idempotency-Key` header. The server verifies the authenticated tenant owns an
active lease, derives the amount from `lease.monthlyRent`, stores a local
`PROCESSING` payment, and sends the amount to Stripe as integer poisha (`BDT *
100`). The response contains the local payment DTO and Stripe `clientSecret`
only for that tenant.

Endpoints:

- `POST /api/v1/payments`
- `GET /api/v1/payments/my-payments`
- `GET /api/v1/payments/managed`
- `GET /api/v1/payments/:id`
- `POST /api/v1/payments/webhook/stripe` (public Stripe webhook)

Payment lists support `page`, `limit` (maximum 100), `status`, `sortBy`, and
`sortOrder`. Tenant queries are always scoped to the authenticated tenant.
Owner and assigned-manager queries resolve authorization through
`lease -> room -> unit -> building -> property`; admin access is explicit.

The webhook route is mounted before JSON parsing and receives the raw request
body. Stripe signatures are verified with `STRIPE_WEBHOOK_SECRET`; only signed
`payment_intent.succeeded` and `payment_intent.payment_failed` events are
processed. The local payment ID, Stripe PaymentIntent ID, amount, and `bdt`
currency are validated before synchronization. Webhook event IDs are stored in
the unique `stripe_webhook_events` ledger, so duplicate and concurrent delivery
is idempotent. Payment creation also persists the unique request idempotency key
and sends a deterministic Stripe idempotency key.

Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`. Secrets,
card data, webhook payloads, and PaymentIntent client secrets are never logged;
raw gateway payloads are retained only in the existing payment gateway-response
field for reconciliation. Payment success does not change lease status and does
not create a booking or reservation.

## Step 15 Utility Bills

Utility bills are property- or unit-scoped financial records. They use the
existing fixed-amount `UtilityBillSplit` model: percentage splits are not
implemented. Bills use BDT, positive amounts with two-decimal precision,
`billingPeriodStart < billingPeriodEnd`, and the existing utility type and
status enums. Bill creation defaults status to `PENDING`; clients cannot set
paid state or payment timestamps.

Endpoints:

- `POST /api/v1/utility-bills` (owner, assigned manager, or admin)
- `GET /api/v1/utility-bills/my-bills` (tenant split visibility)
- `GET /api/v1/utility-bills/managed` (owner, assigned manager, or admin)
- `GET /api/v1/utility-bills/:id` (authorized tenant or property operator)
- `GET /api/v1/utility-bills/:id/splits`
- `POST /api/v1/utility-bills/:id/splits` (owner, assigned manager, or admin)

For a unit-scoped bill, a split tenant must have an active lease for that unit.
Property-scoped bills may be assigned to active tenants by an authorized
operator. Tenants see only bills with their own active split and only their own
split detail; operators see the authorized property's bill and split records.
Owner and manager authorization is resolved through the property relation, not
through a manager role. Admin access is explicit.

Split allocation is partial: the active assigned total may be less than or
equal to the bill total. Every split amount is positive and fixed to two
decimal places. The existing unique `(bill_id, tenant_id)` constraint prevents
duplicate tenant splits. Each split request runs inside a transaction with a
bill-scoped PostgreSQL advisory lock, reloads the bill and current aggregate,
and validates the remaining amount before insertion. Therefore concurrent
requests for one bill cannot over-allocate it, while different bills remain
independent. No split action automatically charges Stripe; Step 14 payment
behavior is unchanged.

Bills and splits are financial history in the existing schema and have no
soft-delete fields. They are not physically deleted, and queries exclude
deleted parent properties, units, buildings, rooms, leases, or tenants where
those relationships apply. DTOs omit owner/manager authorization metadata,
deleted fields, audit data, and payment secrets.

## Step 16 Maintenance Requests

Maintenance requests represent tenant-reported issues for an occupied room.
Creation requires an active, non-deleted lease owned by the authenticated tenant
for the requested room. The server derives `tenantId` from authentication and
`propertyId` through `lease -> room -> unit -> building -> property`.

Endpoints:

- `POST /api/v1/maintenance-requests` (tenant with an eligible active lease)
- `GET /api/v1/maintenance-requests/my-requests` (own requests)
- `GET /api/v1/maintenance-requests/managed` (owner, assigned manager, or admin)
- `GET /api/v1/maintenance-requests/:id`
- `PATCH /api/v1/maintenance-requests/:id` (safe fields only)
- `POST /api/v1/maintenance-requests/:id/start`
- `POST /api/v1/maintenance-requests/:id/resolve`
- `POST /api/v1/maintenance-requests/:id/close`

The existing priority enum is used: `LOW`, `MEDIUM`, `HIGH`, and `URGENT`.
The existing schema has no category field, so categories were not invented.
The lifecycle is server-controlled:

```text
OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED
```

Only owners, assigned managers, and admins can perform lifecycle transitions.
Resolving sets `resolvedAt` on the server. Tenants can edit safe descriptive
fields only while their request is `OPEN`; they cannot change ownership,
status, or `resolvedAt`. Every transition uses a conditional update on the
expected current status, so stale concurrent actions return `409 Conflict`.

Tenant lists and details are scoped to the authenticated tenant. Management
queries scope through the actual property owner/manager relationship, and admin
access is explicit. Normal queries exclude soft-deleted requests, tenants,
rooms, units, buildings, and properties. Maintenance requests do not create
payments, utility bills, notifications, work orders, or schedules.

## Step 17 Soft Delete and Audit Logs

The soft-delete entities are `users`, `properties`, `buildings`, `units`,
`rooms`, `room_availability`, `roommate_profiles`, `preferences`,
`viewing_requests`, `applications`, `leases`, and `maintenance_requests`.
Normal reads, nested relations, authorization checks, creates, and updates
exclude rows where `deletedAt` is not null. Deleted parents make their active
children inaccessible through normal APIs without physically deleting the child
history. Existing delete endpoints set `deletedAt` server-side; clients cannot
submit it. There is no public restore endpoint in Step 17.

`rent_payments`, `utility_bills`, and `utility_bill_splits` remain financial
history and are intentionally not soft-deleted or physically removed.

Audit records use the existing immutable `audit_logs` model. Server-side
`AuditAction` and `AuditResourceType` constants control the action and resource
type; clients cannot forge either value or the actor. The actor comes from the
authenticated user, and resource IDs come from successful mutations. Metadata
is sanitized to remove passwords, tokens, secrets, authorization headers,
cookies, card data, CVCs, and client secrets. IP and user-agent values are only
accepted from trusted server context when supplied.

Critical property, application, lease, and maintenance mutations write audit
events through the centralized audit service. The admin-only endpoint
`GET /api/v1/audit-logs` provides validated, paginated, read-only retrieval with
action, resource, actor, and date filters. No update or delete audit endpoint
exists. Audit failures are not silently swallowed when the audit model is
available; the service test doubles used by existing modules may omit that
delegate for isolated unit tests.

## Step 18 Security Hardening and Redis

Redis is an optimization and abuse-control dependency, never the source of
truth for users, roles, authorization, leases, payments, bills, or maintenance
requests. Configure it with `REDIS_URL`. Redis keys use the `housing:` namespace
and hashed identities/query payloads; secrets, tokens, cookies, credentials,
and payment data are never stored.

Authentication abuse controls protect registration, login, and refresh-token
routes. Login uses independent IP and normalized-email buckets; registration
uses an IP bucket; refresh uses an IP bucket. Counters use an atomic Redis Lua
script combining `INCR` and first-request `EXPIRE`. Exceeded requests return
`429` with `Retry-After`. Rate limiting fails closed with `503` when Redis is
unavailable because bypassing authentication abuse controls is unsafe.

Public `GET /api/v1/properties` uses a cache-aside cache containing only the
existing public DTO and pagination metadata. Query parameters are normalized
by the validated query object, hashed with SHA-256, and keyed with a version
generation. Entries expire after 60 seconds. Property creation/update/delete
and manager changes increment the generation. Cache reads and writes fail open
to PostgreSQL, which remains authoritative; malformed cache JSON is discarded.
No private resource or authorization decision is cached.

The API also applies bounded request bodies (`1mb` JSON and `100kb` URL-encoded)
and safe API headers including content-type sniffing, frame, referrer, and
production-only HSTS protection. Existing HttpOnly, environment-aware auth
cookies and credentialed CORS behavior remain unchanged. Redis is closed during
startup-failure cleanup, and Redis connection errors never alter database
authorization semantics.

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
