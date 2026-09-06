import type { Application, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import config from "../config";
import { buildPaths } from "./paths";
import { sharedSchemas } from "./schemas";

export type OpenApiDocument = {
	openapi: string;
	info: {
		title: string;
		description: string;
		version: string;
		contact?: { name?: string; email?: string };
	};
	servers: Array<{ url: string; description: string }>;
	tags: Array<{ name: string; description: string }>;
	components: {
		securitySchemes: Record<string, unknown>;
		schemas: Record<string, unknown>;
	};
	paths: Record<string, unknown>;
};

/**
 * Builds the OpenAPI 3 document for production APIs.
 * Test-only `/api/v1/__authz` is never included when NODE_ENV !== "test".
 */
export const getOpenApiDocument = (): OpenApiDocument => {
	const serverUrl = config.backend_url?.replace(/\/$/, "") || "https://housing-and-rommate-platform-backen.vercel.app";

	const paths = buildPaths();

	// Defense in depth: never publish the authorization probe route outside test.
	const nodeEnv = process.env.NODE_ENV ?? config.node_env;
	if (nodeEnv !== "test") {
		for (const key of Object.keys(paths)) {
			if (key.includes("/__authz")) {
				delete paths[key];
			}
		}
	}

	return {
		openapi: "3.0.3",
		info: {
			title: "Housing & Roommate Platform API",
			description: [
				"Property rental and roommate matching platform API.",
				"",
				"## Authentication",
				"- Access token: `Authorization: Bearer <access_token>` (JWT).",
				"- Refresh token: HttpOnly `refreshToken` cookie (rotated; server stores hash only).",
				"- An HttpOnly `accessToken` cookie is also set for browser convenience.",
				"",
				"## Roles",
				"Primary roles: `OWNER`, `TENANT`, `ADMIN`.",
				"Property managers are relationship-based via `properties.manager_id` — not a fourth RBAC role.",
				"",
				"## Hierarchy",
				"`Property → Building → Unit → Room → Room Availability`",
				"",
				"## Security",
				"This document never includes JWT secrets, Stripe secrets, Redis credentials, passwords, card data, or refresh token values.",
				"Rate limits apply to register, login, and refresh-token endpoints (`429` + `Retry-After`).",
			].join("\n"),
			version: "1.0.0",
			contact: {
				name: "PH Housing Platform",
			},
		},
		servers: [
			{
				url: serverUrl,
				description: "Configured APP_URL or local development default",
			},
			{
				url: "https://housing-and-rommate-platform-backen.vercel.app",
				description: "Local development",
			},
		],
		tags: [
			{ name: "Authentication", description: "Register, login, refresh, logout, me" },
			{ name: "Properties", description: "Public search and owner/manager property management" },
			{ name: "Buildings", description: "Buildings under a property" },
			{ name: "Units", description: "Units under a building" },
			{ name: "Rooms", description: "Rooms under a unit" },
			{ name: "Room Availability", description: "Availability windows for rooms" },
			{ name: "Roommates", description: "Profiles, preferences, discovery, matching" },
			{ name: "Viewing Requests", description: "Tenant viewing lifecycle" },
			{ name: "Applications", description: "Rental applications (not leases)" },
			{ name: "Leases", description: "Occupancy agreements" },
			{ name: "Payments", description: "Stripe BDT rent payments and webhook" },
			{ name: "Utility Bills", description: "Fixed-amount utility bills and splits" },
			{ name: "Maintenance Requests", description: "Tenant maintenance lifecycle" },
			{ name: "Audit Logs", description: "ADMIN-only immutable audit read API" },
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description:
						"JWT access token from login/register/refresh. Example: `Authorization: Bearer <access_token>`.",
				},
			},
			schemas: { ...sharedSchemas },
		},
		paths,
	};
};

/**
 * Mounts Swagger UI at `/api/docs` and the raw OpenAPI document at `/api/docs.json`.
 */
export const mountSwagger = (app: Application): void => {
	const document = getOpenApiDocument();

	app.get("/api/docs.json", (_req: Request, res: Response) => {
		res.setHeader("Cache-Control", "no-store");
		res.status(200).json(document);
	});

	app.use(
		"/api/docs",
		swaggerUi.serve,
		swaggerUi.setup(document, {
			customSiteTitle: "Housing & Roommate Platform API",
			swaggerOptions: {
				persistAuthorization: true,
				displayRequestDuration: true,
			},
		}),
	);
};
