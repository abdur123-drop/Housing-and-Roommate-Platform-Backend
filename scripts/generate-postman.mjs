import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("postman", { recursive: true });

const uuid = "550e8400-e29b-41d4-a716-446655440000";
const bearer = {
	type: "bearer",
	bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
};

const jsonBody = (raw) => ({
	mode: "raw",
	raw: JSON.stringify(raw, null, 2),
	options: { raw: { language: "json" } },
});

const req = (name, method, path, opts = {}) => {
	const item = {
		name,
		request: {
			method,
			header: opts.headers || [],
			url: {
				raw: `{{baseUrl}}${path}`,
				host: ["{{baseUrl}}"],
				path: path.replace(/^\//, "").split("/").filter(Boolean),
			},
			description: opts.description || "",
		},
	};
	if (opts.auth) item.request.auth = opts.auth;
	if (opts.body) {
		item.request.body = opts.body;
		if (!opts.headers?.some((h) => h.key === "Content-Type")) {
			item.request.header = [
				{ key: "Content-Type", value: "application/json" },
				...(item.request.header || []),
			];
		}
	}
	if (opts.query) item.request.url.query = opts.query;
	if (opts.event) item.event = opts.event;
	return item;
};

const captureId = (envKey, pathExpr) => [
	{
		listen: "test",
		script: {
			type: "text/javascript",
			exec: [
				"try {",
				"  const j = pm.response.json();",
				`  const v = ${pathExpr};`,
				`  if (v) pm.environment.set("${envKey}", v);`,
				"} catch (e) {}",
			],
		},
	},
];

const loginCapture = [
	{
		listen: "test",
		script: {
			type: "text/javascript",
			exec: [
				"try {",
				"  const json = pm.response.json();",
				"  if (json?.data?.accessToken) pm.environment.set('accessToken', json.data.accessToken);",
				"} catch (e) {}",
			],
		},
	},
];

const collection = {
	info: {
		name: "Housing & Roommate Platform API",
		description: [
			"Production API collection for the Housing & Roommate Platform.",
			"",
			"Set `baseUrl` (default http://localhost:5000).",
			"Login/Register scripts store `accessToken` for Bearer auth.",
			"Refresh uses the HttpOnly refreshToken cookie — do not store refresh tokens in environment variables.",
		"Does not include internal authorization probe routes used only in automated tests.",
		"",
		"OpenAPI: GET /api/docs and GET /api/docs.json",
	].join("\n"),
		schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
	},
	auth: bearer,
	variable: [{ key: "baseUrl", value: "http://localhost:5000" }],
	item: [
		{
			name: "Authentication",
			item: [
				req("Register Owner", "POST", "/api/v1/auth/register", {
					body: jsonBody({
						name: "Alex Owner",
						email: "owner@example.com",
						password: "Password1",
						role: "OWNER",
					}),
					event: loginCapture,
					description: "Register an OWNER. Captures accessToken.",
				}),
				req("Register Tenant", "POST", "/api/v1/auth/register", {
					body: jsonBody({
						name: "Taylor Tenant",
						email: "tenant@example.com",
						password: "Password1",
						role: "TENANT",
					}),
					event: loginCapture,
				}),
				req("Login", "POST", "/api/v1/auth/login", {
					body: jsonBody({ email: "owner@example.com", password: "Password1" }),
					event: loginCapture,
					description: "Login and capture accessToken. Rate limited.",
				}),
				req("Refresh Token", "POST", "/api/v1/auth/refresh-token", {
					description:
						"Uses HttpOnly refreshToken cookie from login/register. Enable cookie jar in Postman. Do not put refresh tokens in env vars.",
					body: jsonBody({}),
				}),
				req("Logout", "POST", "/api/v1/auth/logout"),
				req("Me", "GET", "/api/v1/auth/me", { auth: bearer }),
			],
		},
		{
			name: "Properties",
			item: [
				req("Search Properties (Public)", "GET", "/api/v1/properties", {
					query: [
						{ key: "page", value: "1" },
						{ key: "limit", value: "10" },
						{ key: "city", value: "Dhaka", disabled: true },
					],
				}),
				req("My Properties", "GET", "/api/v1/properties/my-properties", { auth: bearer }),
				req("Create Property", "POST", "/api/v1/properties", {
					auth: bearer,
					body: jsonBody({
						title: "Sunny Apartment in Gulshan",
						description: "Bright 2BR near the lake",
						propertyType: "APARTMENT",
						address: "12 Gulshan Avenue",
						city: "Dhaka",
						country: "Bangladesh",
						status: "PUBLISHED",
					}),
					event: captureId("propertyId", "j?.data?.id"),
				}),
				req("Get Property (Public)", "GET", "/api/v1/properties/{{propertyId}}"),
				req("Update Property", "PATCH", "/api/v1/properties/{{propertyId}}", {
					auth: bearer,
					body: jsonBody({ title: "Updated Sunny Apartment" }),
				}),
				req("Assign Manager", "PATCH", "/api/v1/properties/{{propertyId}}/manager", {
					auth: bearer,
					body: jsonBody({ managerId: null }),
					description: "Relationship-based manager assignment. Not a fourth role.",
				}),
				req("Soft Delete Property", "DELETE", "/api/v1/properties/{{propertyId}}", {
					auth: bearer,
				}),
			],
		},
		{
			name: "Buildings",
			item: [
				req("Create Building", "POST", "/api/v1/properties/{{propertyId}}/buildings", {
					auth: bearer,
					body: jsonBody({ name: "Tower A", description: "Main tower" }),
					event: captureId("buildingId", "j?.data?.id"),
				}),
				req("List Buildings", "GET", "/api/v1/properties/{{propertyId}}/buildings", {
					auth: bearer,
				}),
				req("Get Building", "GET", "/api/v1/buildings/{{buildingId}}", { auth: bearer }),
				req("Update Building", "PATCH", "/api/v1/buildings/{{buildingId}}", {
					auth: bearer,
					body: jsonBody({ name: "Tower A Updated" }),
				}),
				req("Delete Building", "DELETE", "/api/v1/buildings/{{buildingId}}", { auth: bearer }),
			],
		},
		{
			name: "Units",
			item: [
				req("Create Unit", "POST", "/api/v1/buildings/{{buildingId}}/units", {
					auth: bearer,
					body: jsonBody({ unitNumber: "5B", floor: 5, bedrooms: 2, bathrooms: 1 }),
					event: captureId("unitId", "j?.data?.id"),
				}),
				req("List Units", "GET", "/api/v1/buildings/{{buildingId}}/units", { auth: bearer }),
				req("Get Unit", "GET", "/api/v1/units/{{unitId}}", { auth: bearer }),
				req("Update Unit", "PATCH", "/api/v1/units/{{unitId}}", {
					auth: bearer,
					body: jsonBody({ floor: 6 }),
				}),
				req("Delete Unit", "DELETE", "/api/v1/units/{{unitId}}", { auth: bearer }),
			],
		},
		{
			name: "Rooms",
			item: [
				req("Create Room", "POST", "/api/v1/units/{{unitId}}/rooms", {
					auth: bearer,
					body: jsonBody({
						roomNumber: "R1",
						roomType: "PRIVATE",
						monthlyRent: 18000,
						securityDeposit: 18000,
						status: "AVAILABLE",
					}),
					event: captureId("roomId", "j?.data?.id"),
				}),
				req("List Rooms", "GET", "/api/v1/units/{{unitId}}/rooms", { auth: bearer }),
				req("Get Room", "GET", "/api/v1/rooms/{{roomId}}", { auth: bearer }),
				req("Update Room", "PATCH", "/api/v1/rooms/{{roomId}}", {
					auth: bearer,
					body: jsonBody({ monthlyRent: 19000 }),
				}),
				req("Delete Room", "DELETE", "/api/v1/rooms/{{roomId}}", { auth: bearer }),
			],
		},
		{
			name: "Room Availability",
			item: [
				req("Create Availability", "POST", "/api/v1/rooms/{{roomId}}/availability", {
					auth: bearer,
					body: jsonBody({
						availableFrom: "2026-10-01T00:00:00.000Z",
						availableTo: "2027-10-01T00:00:00.000Z",
						status: "AVAILABLE",
					}),
					event: captureId("availabilityId", "j?.data?.id"),
				}),
				req("List Availability", "GET", "/api/v1/rooms/{{roomId}}/availability", {
					auth: bearer,
				}),
				req("Get Availability", "GET", "/api/v1/room-availability/{{availabilityId}}", {
					auth: bearer,
				}),
				req("Update Availability", "PATCH", "/api/v1/room-availability/{{availabilityId}}", {
					auth: bearer,
					body: jsonBody({ status: "AVAILABLE" }),
				}),
				req("Delete Availability", "DELETE", "/api/v1/room-availability/{{availabilityId}}", {
					auth: bearer,
				}),
			],
		},
		{
			name: "Roommates",
			item: [
				req("Create Roommate Profile", "POST", "/api/v1/roommate-profile", {
					auth: bearer,
					body: jsonBody({
						bio: "Quiet professional",
						budgetMin: 10000,
						budgetMax: 20000,
						preferredLocation: "Dhaka",
						isDiscoverable: true,
					}),
					event: captureId("roommateProfileId", "j?.data?.id"),
				}),
				req("Get My Profile", "GET", "/api/v1/roommate-profile/me", { auth: bearer }),
				req("Update My Profile", "PATCH", "/api/v1/roommate-profile/me", {
					auth: bearer,
					body: jsonBody({ bio: "Updated bio" }),
				}),
				req("Get My Preferences", "GET", "/api/v1/roommate-preferences/me", { auth: bearer }),
				req("Replace My Preferences", "PUT", "/api/v1/roommate-preferences/me", {
					auth: bearer,
					body: jsonBody({ preferences: [] }),
				}),
				req("Preference Catalog", "GET", "/api/v1/preferences", { auth: bearer }),
				req("Discover Roommates", "GET", "/api/v1/roommates", { auth: bearer }),
				req("Roommate Matches", "GET", "/api/v1/roommates/matches", { auth: bearer }),
				req("Roommate Detail", "GET", "/api/v1/roommates/{{roommateProfileId}}", {
					auth: bearer,
				}),
				req("Delete My Profile", "DELETE", "/api/v1/roommate-profile/me", { auth: bearer }),
			],
		},
		{
			name: "Viewing Requests",
			item: [
				req("Create Viewing Request", "POST", "/api/v1/viewing-requests", {
					auth: bearer,
					body: jsonBody({
						roomId: "{{roomId}}",
						requestedDate: "2026-11-15T10:00:00.000Z",
						message: "Looking forward to viewing",
					}),
					event: captureId("viewingRequestId", "j?.data?.id"),
				}),
				req("My Viewing Requests", "GET", "/api/v1/viewing-requests/my-requests", {
					auth: bearer,
				}),
				req("Managed Viewing Requests", "GET", "/api/v1/viewing-requests/managed", {
					auth: bearer,
				}),
				req(
					"Property Viewing Requests",
					"GET",
					"/api/v1/properties/{{propertyId}}/viewing-requests",
					{ auth: bearer },
				),
				req("Get Viewing Request", "GET", "/api/v1/viewing-requests/{{viewingRequestId}}", {
					auth: bearer,
				}),
				req(
					"Approve Viewing Request",
					"PATCH",
					"/api/v1/viewing-requests/{{viewingRequestId}}/approve",
					{ auth: bearer },
				),
				req(
					"Reject Viewing Request",
					"PATCH",
					"/api/v1/viewing-requests/{{viewingRequestId}}/reject",
					{ auth: bearer },
				),
				req(
					"Cancel Viewing Request",
					"PATCH",
					"/api/v1/viewing-requests/{{viewingRequestId}}/cancel",
					{ auth: bearer },
				),
			],
		},
		{
			name: "Applications",
			item: [
				req("Create Application", "POST", "/api/v1/applications", {
					auth: bearer,
					body: jsonBody({ roomId: "{{roomId}}", message: "I would like to rent this room" }),
					event: captureId("applicationId", "j?.data?.id"),
				}),
				req("My Applications", "GET", "/api/v1/applications/my-applications", { auth: bearer }),
				req("Managed Applications", "GET", "/api/v1/applications/managed", { auth: bearer }),
				req("Property Applications", "GET", "/api/v1/properties/{{propertyId}}/applications", {
					auth: bearer,
				}),
				req("Get Application", "GET", "/api/v1/applications/{{applicationId}}", { auth: bearer }),
				req("Approve Application", "PATCH", "/api/v1/applications/{{applicationId}}/approve", {
					auth: bearer,
				}),
				req("Reject Application", "PATCH", "/api/v1/applications/{{applicationId}}/reject", {
					auth: bearer,
				}),
				req("Withdraw Application", "PATCH", "/api/v1/applications/{{applicationId}}/withdraw", {
					auth: bearer,
				}),
			],
		},
		{
			name: "Leases",
			item: [
				req("Create Lease", "POST", "/api/v1/leases", {
					auth: bearer,
					body: jsonBody({
						applicationId: "{{applicationId}}",
						startDate: "2026-12-01T00:00:00.000Z",
						endDate: "2027-12-01T00:00:00.000Z",
					}),
					event: captureId("leaseId", "j?.data?.id"),
				}),
				req("My Leases", "GET", "/api/v1/leases/my-leases", { auth: bearer }),
				req("Managed Leases", "GET", "/api/v1/leases/managed", { auth: bearer }),
				req("Get Lease", "GET", "/api/v1/leases/{{leaseId}}", { auth: bearer }),
				req("Terminate Lease", "POST", "/api/v1/leases/{{leaseId}}/terminate", { auth: bearer }),
			],
		},
		{
			name: "Payments",
			item: [
				req("Create Payment", "POST", "/api/v1/payments", {
					auth: bearer,
					headers: [
						{ key: "Content-Type", value: "application/json" },
						{ key: "Idempotency-Key", value: `pay-idem-${uuid}` },
					],
					body: jsonBody({ leaseId: "{{leaseId}}" }),
					event: captureId("paymentId", "j?.data?.payment?.id"),
					description:
						"BDT PaymentIntent. Amount is server-derived. Requires Idempotency-Key. Do not send card data here.",
				}),
				req("My Payments", "GET", "/api/v1/payments/my-payments", { auth: bearer }),
				req("Managed Payments", "GET", "/api/v1/payments/managed", { auth: bearer }),
				req("Get Payment", "GET", "/api/v1/payments/{{paymentId}}", { auth: bearer }),
				req("Stripe Webhook", "POST", "/api/v1/payments/webhook/stripe", {
					headers: [
						{ key: "Content-Type", value: "application/json" },
						{ key: "Stripe-Signature", value: "t=0,v1=example_signature_placeholder" },
					],
					body: jsonBody({
						id: "evt_example_placeholder",
						type: "payment_intent.succeeded",
						data: { object: { id: "pi_example_placeholder" } },
					}),
					description:
						"Requires raw body + Stripe-Signature verification. Placeholder payload only.",
				}),
			],
		},
		{
			name: "Utility Bills",
			item: [
				req("Create Utility Bill", "POST", "/api/v1/utility-bills", {
					auth: bearer,
					body: jsonBody({
						propertyId: "{{propertyId}}",
						unitId: "{{unitId}}",
						type: "ELECTRICITY",
						totalAmount: 3500.5,
						billingPeriodStart: "2026-09-01T00:00:00.000Z",
						billingPeriodEnd: "2026-10-01T00:00:00.000Z",
						dueDate: "2026-10-15T00:00:00.000Z",
					}),
					event: captureId("utilityBillId", "j?.data?.id"),
				}),
				req("My Bills", "GET", "/api/v1/utility-bills/my-bills", { auth: bearer }),
				req("Managed Bills", "GET", "/api/v1/utility-bills/managed", { auth: bearer }),
				req("Get Bill", "GET", "/api/v1/utility-bills/{{utilityBillId}}", { auth: bearer }),
				req("List Splits", "GET", "/api/v1/utility-bills/{{utilityBillId}}/splits", {
					auth: bearer,
				}),
				req("Create Split", "POST", "/api/v1/utility-bills/{{utilityBillId}}/splits", {
					auth: bearer,
					body: jsonBody({ tenantId: uuid, amount: 1750.25 }),
					description: "Fixed-amount split only. No percentage splitting.",
				}),
			],
		},
		{
			name: "Maintenance Requests",
			item: [
				req("Create Maintenance Request", "POST", "/api/v1/maintenance-requests", {
					auth: bearer,
					body: jsonBody({
						roomId: "{{roomId}}",
						title: "Leaking faucet",
						description: "Kitchen sink drips continuously",
						priority: "MEDIUM",
					}),
					event: captureId("maintenanceRequestId", "j?.data?.id"),
				}),
				req("My Maintenance Requests", "GET", "/api/v1/maintenance-requests/my-requests", {
					auth: bearer,
				}),
				req("Managed Maintenance Requests", "GET", "/api/v1/maintenance-requests/managed", {
					auth: bearer,
				}),
				req("Get Maintenance Request", "GET", "/api/v1/maintenance-requests/{{maintenanceRequestId}}", {
					auth: bearer,
				}),
				req(
					"Update Maintenance Request",
					"PATCH",
					"/api/v1/maintenance-requests/{{maintenanceRequestId}}",
					{
						auth: bearer,
						body: jsonBody({ title: "Leaking faucet - updated" }),
					},
				),
				req("Start", "POST", "/api/v1/maintenance-requests/{{maintenanceRequestId}}/start", {
					auth: bearer,
				}),
				req("Resolve", "POST", "/api/v1/maintenance-requests/{{maintenanceRequestId}}/resolve", {
					auth: bearer,
				}),
				req("Close", "POST", "/api/v1/maintenance-requests/{{maintenanceRequestId}}/close", {
					auth: bearer,
				}),
			],
		},
		{
			name: "Audit Logs",
			item: [
				req("List Audit Logs", "GET", "/api/v1/audit-logs", {
					auth: bearer,
					query: [
						{ key: "page", value: "1" },
						{ key: "limit", value: "50" },
					],
					description: "ADMIN only. Immutable read-only records.",
				}),
			],
		},
		{
			name: "Happy Path Workflow",
			description:
				"Suggested order: Register Owner → Login → Create Property → Building → Unit → Room → Availability → Register/Login Tenant → Search → Roommate Profile → Viewing → Application → Approve → Lease → Payment → Utility Bill/Split → Maintenance → Resolve.",
			item: [
				req("1. Login Owner", "POST", "/api/v1/auth/login", {
					body: jsonBody({ email: "owner@example.com", password: "Password1" }),
					event: loginCapture,
				}),
				req("2. Create Property", "POST", "/api/v1/properties", {
					auth: bearer,
					body: jsonBody({
						title: "Workflow Property",
						propertyType: "APARTMENT",
						address: "1 Example Street",
						city: "Dhaka",
						country: "Bangladesh",
						status: "PUBLISHED",
					}),
					event: captureId("propertyId", "j?.data?.id"),
				}),
			],
		},
	],
};

const environment = {
	id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
	name: "Housing Roommate Platform - Development",
	values: [
		{ key: "baseUrl", value: "http://localhost:5000", type: "default", enabled: true },
		{ key: "accessToken", value: "", type: "secret", enabled: true },
		{ key: "propertyId", value: "", type: "default", enabled: true },
		{ key: "buildingId", value: "", type: "default", enabled: true },
		{ key: "unitId", value: "", type: "default", enabled: true },
		{ key: "roomId", value: "", type: "default", enabled: true },
		{ key: "availabilityId", value: "", type: "default", enabled: true },
		{ key: "roommateProfileId", value: "", type: "default", enabled: true },
		{ key: "viewingRequestId", value: "", type: "default", enabled: true },
		{ key: "applicationId", value: "", type: "default", enabled: true },
		{ key: "leaseId", value: "", type: "default", enabled: true },
		{ key: "paymentId", value: "", type: "default", enabled: true },
		{ key: "utilityBillId", value: "", type: "default", enabled: true },
		{ key: "maintenanceRequestId", value: "", type: "default", enabled: true },
	],
	_postman_variable_scope: "environment",
};

writeFileSync(
	"postman/Housing-Roommate-Platform.postman_collection.json",
	`${JSON.stringify(collection, null, 2)}\n`,
);
writeFileSync(
	"postman/Housing-Roommate-Platform.postman_environment.json",
	`${JSON.stringify(environment, null, 2)}\n`,
);
console.log("Postman files written");
