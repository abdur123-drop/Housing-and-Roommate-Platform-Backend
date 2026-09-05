import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { getOpenApiDocument } from "./swagger";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
});

const REQUIRED_FOLDERS = [
	"Authentication",
	"Properties",
	"Buildings",
	"Units",
	"Rooms",
	"Room Availability",
	"Roommates",
	"Viewing Requests",
	"Applications",
	"Leases",
	"Payments",
	"Utility Bills",
	"Maintenance Requests",
	"Audit Logs",
] as const;

const REQUIRED_PATHS = [
	"/api/v1/auth/register",
	"/api/v1/auth/login",
	"/api/v1/auth/refresh-token",
	"/api/v1/auth/logout",
	"/api/v1/auth/me",
	"/api/v1/properties",
	"/api/v1/leases",
	"/api/v1/payments",
	"/api/v1/payments/webhook/stripe",
	"/api/v1/utility-bills",
	"/api/v1/maintenance-requests",
	"/api/v1/audit-logs",
] as const;

describe("OpenAPI contract", () => {
	it("generates an OpenAPI document with required auth metadata and excludes the test route in production mode", () => {
		process.env.NODE_ENV = "production";
		const doc = getOpenApiDocument();

		assert.equal(doc.openapi, "3.0.3");
		assert.equal(doc.info.title, "Housing & Roommate Platform API");
		assert.equal(doc.info.version, "1.0.0");
		assert.ok(doc.components?.securitySchemes?.bearerAuth);
		assert.ok(doc.paths["/api/v1/auth/login"]);
		assert.ok(doc.paths["/api/v1/auth/refresh-token"]);
		assert.ok(doc.paths["/api/v1/properties"]);
		assert.equal(doc.paths["/api/v1/__authz"], undefined);

		for (const path of REQUIRED_PATHS) {
			assert.ok(doc.paths[path], `missing OpenAPI path ${path}`);
		}

		const serialized = JSON.stringify(doc);
		assert.ok(!serialized.includes("JWT_ACCESS_SECRET"));
		assert.ok(!serialized.includes("JWT_REFRESH_SECRET"));
		assert.ok(!serialized.includes("STRIPE_SECRET_KEY"));
		assert.ok(!serialized.includes("STRIPE_WEBHOOK_SECRET"));
		assert.ok(!serialized.includes("REDIS_URL"));
		assert.ok(!serialized.includes("DATABASE_URL"));
		assert.ok(!serialized.includes("/__authz"));
	});

	it("parses Postman collection and environment files without committed secrets", () => {
		const collectionPath = join(
			process.cwd(),
			"postman",
			"Housing-Roommate-Platform.postman_collection.json",
		);
		const environmentPath = join(
			process.cwd(),
			"postman",
			"Housing-Roommate-Platform.postman_environment.json",
		);

		const collection = JSON.parse(readFileSync(collectionPath, "utf8"));
		const environment = JSON.parse(readFileSync(environmentPath, "utf8"));

		assert.equal(collection.info.name, "Housing & Roommate Platform API");
		const folderNames = collection.item.map((folder: { name: string }) => folder.name);
		for (const folder of REQUIRED_FOLDERS) {
			assert.ok(folderNames.includes(folder), `missing Postman folder ${folder}`);
		}

		assert.ok(environment.values.some((item: { key: string }) => item.key === "baseUrl"));
		assert.ok(environment.values.some((item: { key: string }) => item.key === "accessToken"));

		const collectionText = JSON.stringify(collection);
		const environmentText = JSON.stringify(environment);
		assert.ok(!collectionText.includes("JWT_ACCESS_SECRET"));
		assert.ok(!collectionText.includes("STRIPE_SECRET_KEY"));
		assert.ok(!collectionText.includes("/__authz"));
		assert.ok(!environmentText.includes("JWT_ACCESS_SECRET"));
		assert.ok(!environmentText.includes("STRIPE_SECRET_KEY"));
		assert.ok(!environmentText.includes("refreshToken"));
		assert.ok(!environmentText.includes("DATABASE_URL"));
	});
});
