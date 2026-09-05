/**
 * OpenAPI path definitions derived from mounted Express routes.
 * Authorization notes reflect route middleware + service-level checks.
 */

import {
	bearerSecurity,
	commonResponses,
	paginationQuery,
	uuidParam,
} from "./schemas";

const R = commonResponses;

const success = (description: string, dataSchema: Record<string, unknown>, withMeta = false) => ({
	description,
	content: {
		"application/json": {
			schema: {
				type: "object",
				properties: {
					success: { type: "boolean", example: true },
					message: { type: "string" },
					...(withMeta ? { meta: { $ref: "#/components/schemas/SuccessMeta" } } : {}),
					data: dataSchema,
				},
			},
		},
	},
});

const authzNote = (text: string) =>
	`\n\n**Authorization:** ${text}`;

export const buildPaths = (): Record<string, unknown> => {
	const paths: Record<string, unknown> = {
		"/api/v1/auth/register": {
			post: {
				tags: ["Authentication"],
				summary: "Register OWNER or TENANT",
				description:
					"Creates a user with role OWNER or TENANT. ADMIN cannot self-register." +
					" Rate limited: 10 requests/hour per IP. Sets HttpOnly refreshToken and accessToken cookies.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["name", "email", "password", "role"],
								properties: {
									name: { type: "string", minLength: 2, maxLength: 100, example: "Alex Owner" },
									email: { type: "string", format: "email", example: "owner@example.com" },
									password: {
										type: "string",
										minLength: 8,
										maxLength: 72,
										description: "Must include upper, lower, and digit",
										example: "Password1",
									},
									phone: { type: "string", minLength: 6, maxLength: 20 },
									role: { type: "string", enum: ["OWNER", "TENANT"] },
								},
							},
						},
					},
				},
				responses: {
					"201": success("Registered", { $ref: "#/components/schemas/AuthSessionData" }),
					"400": R.BadRequest,
					"409": R.Conflict,
					"429": R.TooManyRequests,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/auth/login": {
			post: {
				tags: ["Authentication"],
				summary: "Login",
				description:
					"Returns access token and user. Sets HttpOnly cookies. Rate limited: 20/min per IP and 8/5min per email.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["email", "password"],
								properties: {
									email: { type: "string", format: "email", example: "owner@example.com" },
									password: { type: "string", example: "Password1" },
								},
							},
						},
					},
				},
				responses: {
					"200": success("Logged in", { $ref: "#/components/schemas/AuthSessionData" }),
					"400": R.BadRequest,
					"401": R.Unauthorized,
					"429": R.TooManyRequests,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/auth/refresh-token": {
			post: {
				tags: ["Authentication"],
				summary: "Refresh access token",
				description:
					"Rotates the refresh token. Prefer the HttpOnly `refreshToken` cookie. " +
					"Optional body `refreshToken` exists for non-browser clients — do not paste refresh tokens into Swagger casually. " +
					"Server stores only a SHA-256 hash; reuse detection revokes all sessions for the user. " +
					"Rate limited: 30/min per IP. Refresh tokens are never returned as plaintext response fields.",
				requestBody: {
					required: false,
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									refreshToken: {
										type: "string",
										description: "Optional fallback when cookie is unavailable",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": success("Token refreshed", { $ref: "#/components/schemas/AuthSessionData" }),
					"400": R.BadRequest,
					"401": R.Unauthorized,
					"429": R.TooManyRequests,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/auth/logout": {
			post: {
				tags: ["Authentication"],
				summary: "Logout",
				description:
					"Revokes refresh token (cookie or optional body) and clears auth cookies. Does not require a valid access token.",
				responses: {
					"200": success("Logged out", { type: "null", nullable: true }),
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/auth/me": {
			get: {
				tags: ["Authentication"],
				summary: "Current user",
				description: "Returns the authenticated active user profile." + authzNote("Any authenticated active user."),
				security: bearerSecurity,
				responses: {
					"200": success("Current user", { $ref: "#/components/schemas/AuthUser" }),
					"401": R.Unauthorized,
					"500": R.InternalError,
				},
			},
		},

		"/api/v1/properties": {
			get: {
				tags: ["Properties"],
				summary: "Public property search",
				description:
					"Lists PUBLISHED, non-deleted properties with search, filters, pagination, and sorting. " +
					"May be served from a Redis cache-aside layer (public DTO only). " +
					"Does not expose ownerId, managerId, deletedAt, or private user data.",
				parameters: [
					...paginationQuery,
					{ name: "search", in: "query", schema: { type: "string" } },
					{
						name: "propertyType",
						in: "query",
						schema: {
							type: "string",
							enum: ["APARTMENT", "HOUSE", "BUILDING", "CONDO", "VILLA", "OTHER"],
						},
					},
					{ name: "city", in: "query", schema: { type: "string" } },
					{ name: "state", in: "query", schema: { type: "string" } },
					{ name: "country", in: "query", schema: { type: "string" } },
					{ name: "minPrice", in: "query", schema: { type: "number" } },
					{ name: "maxPrice", in: "query", schema: { type: "number" } },
					{
						name: "availableFrom",
						in: "query",
						schema: { type: "string", format: "date-time" },
						description: "Half-open availability intersection filter",
					},
					{
						name: "availableTo",
						in: "query",
						schema: { type: "string", format: "date-time" },
					},
					{
						name: "sortBy",
						in: "query",
						schema: {
							type: "string",
							enum: [
								"createdAt",
								"updatedAt",
								"title",
								"city",
								"state",
								"country",
								"propertyType",
								"status",
							],
						},
					},
				],
				responses: {
					"200": success(
						"Public properties",
						{ type: "array", items: { $ref: "#/components/schemas/PublicProperty" } },
						true,
					),
					"400": R.BadRequest,
					"500": R.InternalError,
				},
			},
			post: {
				tags: ["Properties"],
				summary: "Create property",
				description:
					"Creates a property for the authenticated owner (or admin)." +
					authzNote("OWNER or ADMIN. ownerId is server-derived; clients cannot set ownerId/managerId/deletedAt."),
				security: bearerSecurity,
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["title", "propertyType", "address", "city", "country"],
								properties: {
									title: { type: "string", example: "Sunny Apartment in Gulshan" },
									description: { type: "string" },
									propertyType: {
										type: "string",
										enum: ["APARTMENT", "HOUSE", "BUILDING", "CONDO", "VILLA", "OTHER"],
									},
									address: { type: "string" },
									city: { type: "string", example: "Dhaka" },
									state: { type: "string" },
									country: { type: "string", example: "Bangladesh" },
									zipCode: { type: "string" },
									latitude: { type: "number" },
									longitude: { type: "number" },
									status: {
										type: "string",
										enum: ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"],
									},
								},
							},
						},
					},
				},
				responses: {
					"201": success("Created", { $ref: "#/components/schemas/ManagedProperty" }),
					"400": R.BadRequest,
					"401": R.Unauthorized,
					"403": R.Forbidden,
					"409": R.Conflict,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/properties/my-properties": {
			get: {
				tags: ["Properties"],
				summary: "List my properties",
				description: "Owner/admin managed listing." + authzNote("OWNER or ADMIN."),
				security: bearerSecurity,
				parameters: [...paginationQuery],
				responses: {
					"200": success(
						"Managed properties",
						{ type: "array", items: { $ref: "#/components/schemas/ManagedProperty" } },
						true,
					),
					"401": R.Unauthorized,
					"403": R.Forbidden,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/properties/{id}": {
			get: {
				tags: ["Properties"],
				summary: "Public property detail",
				description: "Returns a PUBLISHED, non-deleted property as the public DTO.",
				parameters: [uuidParam("id", "Property id")],
				responses: {
					"200": success("Property", { $ref: "#/components/schemas/PublicProperty" }),
					"404": R.NotFound,
					"500": R.InternalError,
				},
			},
			patch: {
				tags: ["Properties"],
				summary: "Update property",
				description:
					authzNote(
						"Property owner, assigned manager (properties.manager_id), or ADMIN. Manager access is relationship-based, not a fourth role.",
					),
				security: bearerSecurity,
				parameters: [uuidParam("id", "Property id")],
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									title: { type: "string" },
									description: { type: "string" },
									propertyType: { type: "string" },
									address: { type: "string" },
									city: { type: "string" },
									state: { type: "string" },
									country: { type: "string" },
									zipCode: { type: "string" },
									latitude: { type: "number" },
									longitude: { type: "number" },
									status: { type: "string" },
								},
							},
						},
					},
				},
				responses: {
					"200": success("Updated", { $ref: "#/components/schemas/ManagedProperty" }),
					"400": R.BadRequest,
					"401": R.Unauthorized,
					"403": R.Forbidden,
					"404": R.NotFound,
					"500": R.InternalError,
				},
			},
			delete: {
				tags: ["Properties"],
				summary: "Soft-delete property",
				description: authzNote("Property owner or ADMIN."),
				security: bearerSecurity,
				parameters: [uuidParam("id", "Property id")],
				responses: {
					"200": success("Soft-deleted", { $ref: "#/components/schemas/ManagedProperty" }),
					"401": R.Unauthorized,
					"403": R.Forbidden,
					"404": R.NotFound,
					"500": R.InternalError,
				},
			},
		},
		"/api/v1/properties/{id}/manager": {
			patch: {
				tags: ["Properties"],
				summary: "Assign or remove property manager",
				description:
					"Sets `managerId` to a live user id or null." +
					authzNote("Property owner or ADMIN. Manager is not a global RBAC role."),
				security: bearerSecurity,
				parameters: [uuidParam("id", "Property id")],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["managerId"],
								properties: {
									managerId: {
										type: "string",
										format: "uuid",
										nullable: true,
										example: "550e8400-e29b-41d4-a716-446655440000",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": success("Manager updated", { $ref: "#/components/schemas/ManagedProperty" }),
					"400": R.BadRequest,
					"401": R.Unauthorized,
					"403": R.Forbidden,
					"404": R.NotFound,
					"500": R.InternalError,
				},
			},
		},
	};

	Object.assign(paths, buildingPaths(), unitPaths(), roomPaths(), availabilityPaths());
	Object.assign(paths, roommatePaths(), viewingPaths(), applicationPaths());
	Object.assign(paths, leasePaths(), paymentPaths(), utilityPaths(), maintenancePaths(), auditPaths());

	return paths;
};

const buildingPaths = () => ({
	"/api/v1/properties/{propertyId}/buildings": {
		post: {
			tags: ["Buildings"],
			summary: "Create building",
			description:
				"Hierarchy: Property → Building → Unit → Room." +
				authzNote("Property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("propertyId", "Property id")],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["name"],
							properties: {
								name: { type: "string", example: "Tower A" },
								description: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Building" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
				"409": R.Conflict,
			},
		},
		get: {
			tags: ["Buildings"],
			summary: "List buildings for property",
			security: bearerSecurity,
			parameters: [
				uuidParam("propertyId", "Property id"),
				...paginationQuery,
				{ name: "search", in: "query", schema: { type: "string" } },
				{
					name: "sortBy",
					in: "query",
					schema: { type: "string", enum: ["name", "createdAt", "updatedAt"] },
				},
			],
			responses: {
				"200": success(
					"Buildings",
					{ type: "array", items: { $ref: "#/components/schemas/Building" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/buildings/{id}": {
		get: {
			tags: ["Buildings"],
			summary: "Building detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Building id")],
			responses: {
				"200": success("Building", { $ref: "#/components/schemas/Building" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Buildings"],
			summary: "Update building",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Building id")],
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								name: { type: "string" },
								description: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/Building" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		delete: {
			tags: ["Buildings"],
			summary: "Soft-delete building",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Building id")],
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/Building" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
});

const unitPaths = () => ({
	"/api/v1/buildings/{buildingId}/units": {
		post: {
			tags: ["Units"],
			summary: "Create unit",
			description: authzNote("Property owner, assigned manager, or ADMIN via building hierarchy."),
			security: bearerSecurity,
			parameters: [uuidParam("buildingId", "Building id")],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["unitNumber"],
							properties: {
								unitNumber: { type: "string", example: "5B" },
								floor: { type: "integer" },
								bedrooms: { type: "integer" },
								bathrooms: { type: "number" },
								status: {
									type: "string",
									enum: [
										"AVAILABLE",
										"PARTIALLY_OCCUPIED",
										"FULLY_OCCUPIED",
										"MAINTENANCE",
										"UNAVAILABLE",
									],
								},
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Unit" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		get: {
			tags: ["Units"],
			summary: "List units",
			security: bearerSecurity,
			parameters: [
				uuidParam("buildingId", "Building id"),
				...paginationQuery,
				{ name: "status", in: "query", schema: { type: "string" } },
			],
			responses: {
				"200": success(
					"Units",
					{ type: "array", items: { $ref: "#/components/schemas/Unit" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/units/{id}": {
		get: {
			tags: ["Units"],
			summary: "Unit detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Unit id")],
			responses: {
				"200": success("Unit", { $ref: "#/components/schemas/Unit" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Units"],
			summary: "Update unit",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Unit id")],
			requestBody: {
				content: {
					"application/json": {
						schema: { type: "object", additionalProperties: true },
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/Unit" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		delete: {
			tags: ["Units"],
			summary: "Soft-delete unit",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Unit id")],
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/Unit" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
});

const roomPaths = () => ({
	"/api/v1/units/{unitId}/rooms": {
		post: {
			tags: ["Rooms"],
			summary: "Create room",
			description: authzNote("Property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("unitId", "Unit id")],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["roomNumber", "roomType", "monthlyRent"],
							properties: {
								roomNumber: { type: "string", example: "R1" },
								name: { type: "string" },
								roomType: {
									type: "string",
									enum: ["PRIVATE", "SHARED", "MASTER", "STUDIO"],
								},
								monthlyRent: { type: "number", exclusiveMinimum: 0, example: 18000 },
								securityDeposit: { type: "number", exclusiveMinimum: 0 },
								status: {
									type: "string",
									enum: ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE", "UNAVAILABLE"],
								},
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Room" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
		get: {
			tags: ["Rooms"],
			summary: "List rooms",
			security: bearerSecurity,
			parameters: [
				uuidParam("unitId", "Unit id"),
				...paginationQuery,
				{ name: "status", in: "query", schema: { type: "string" } },
				{ name: "roomType", in: "query", schema: { type: "string" } },
			],
			responses: {
				"200": success(
					"Rooms",
					{ type: "array", items: { $ref: "#/components/schemas/Room" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/rooms/{id}": {
		get: {
			tags: ["Rooms"],
			summary: "Room detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Room id")],
			responses: {
				"200": success("Room", { $ref: "#/components/schemas/Room" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Rooms"],
			summary: "Update room",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Room id")],
			requestBody: {
				content: {
					"application/json": {
						schema: { type: "object", additionalProperties: true },
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/Room" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		delete: {
			tags: ["Rooms"],
			summary: "Soft-delete room",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Room id")],
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/Room" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
});

const availabilityPaths = () => ({
	"/api/v1/rooms/{roomId}/availability": {
		post: {
			tags: ["Room Availability"],
			summary: "Create availability window",
			description:
				"ISO date-times. Half-open interval semantics; overlapping AVAILABLE windows return 409." +
				authzNote("Property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("roomId", "Room id")],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["availableFrom"],
							properties: {
								availableFrom: { type: "string", format: "date-time" },
								availableTo: {
									type: "string",
									format: "date-time",
									description: "Must be after availableFrom when set",
								},
								status: {
									type: "string",
									enum: ["AVAILABLE", "UNAVAILABLE", "RESERVED", "OCCUPIED"],
								},
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/RoomAvailability" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
		get: {
			tags: ["Room Availability"],
			summary: "List room availability",
			security: bearerSecurity,
			parameters: [
				uuidParam("roomId", "Room id"),
				...paginationQuery,
				{ name: "status", in: "query", schema: { type: "string" } },
				{ name: "from", in: "query", schema: { type: "string", format: "date-time" } },
				{ name: "to", in: "query", schema: { type: "string", format: "date-time" } },
			],
			responses: {
				"200": success(
					"Availability",
					{ type: "array", items: { $ref: "#/components/schemas/RoomAvailability" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/room-availability/{id}": {
		get: {
			tags: ["Room Availability"],
			summary: "Availability detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Availability id")],
			responses: {
				"200": success("Availability", { $ref: "#/components/schemas/RoomAvailability" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Room Availability"],
			summary: "Update availability",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Availability id")],
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								availableFrom: { type: "string", format: "date-time" },
								availableTo: { type: "string", format: "date-time" },
								status: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/RoomAvailability" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
		delete: {
			tags: ["Room Availability"],
			summary: "Soft-delete availability",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Availability id")],
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/RoomAvailability" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
});

const roommatePaths = () => ({
	"/api/v1/roommate-profile": {
		post: {
			tags: ["Roommates"],
			summary: "Create roommate profile",
			description:
				"Tenant-owned profile. `userId` is server-derived." + authzNote("TENANT only."),
			security: bearerSecurity,
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								bio: { type: "string" },
								occupation: { type: "string" },
								budgetMin: { type: "number" },
								budgetMax: { type: "number" },
								preferredLocation: { type: "string" },
								moveInDate: { type: "string", format: "date-time" },
								smoking: { type: "boolean" },
								pets: { type: "boolean" },
								genderPreference: { type: "string" },
								isDiscoverable: { type: "boolean" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/RoommateProfile" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/roommate-profile/me": {
		get: {
			tags: ["Roommates"],
			summary: "Get my roommate profile",
			security: bearerSecurity,
			responses: {
				"200": success("Profile", { $ref: "#/components/schemas/RoommateProfile" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Roommates"],
			summary: "Update my roommate profile",
			security: bearerSecurity,
			requestBody: {
				content: {
					"application/json": {
						schema: { type: "object", additionalProperties: true },
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/RoommateProfile" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
		delete: {
			tags: ["Roommates"],
			summary: "Soft-delete my roommate profile",
			security: bearerSecurity,
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/RoommateProfile" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/roommate-preferences/me": {
		get: {
			tags: ["Roommates"],
			summary: "Get my preference selections",
			security: bearerSecurity,
			responses: {
				"200": success("Preferences", { type: "array", items: { type: "object" } }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
		put: {
			tags: ["Roommates"],
			summary: "Replace my preference selections",
			description: "Max 50 unique preferenceIds.",
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["preferences"],
							properties: {
								preferences: {
									type: "array",
									maxItems: 50,
									items: {
										type: "object",
										required: ["preferenceId"],
										properties: {
											preferenceId: { type: "string", format: "uuid" },
											value: { type: "string" },
										},
									},
								},
							},
						},
					},
				},
			},
			responses: {
				"200": success("Updated", { type: "array", items: { type: "object" } }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/preferences": {
		get: {
			tags: ["Roommates"],
			summary: "Preference catalog",
			description: authzNote("Any authenticated user."),
			security: bearerSecurity,
			responses: {
				"200": success("Catalog", {
					type: "array",
					items: { $ref: "#/components/schemas/Preference" },
				}),
				"401": R.Unauthorized,
			},
		},
		post: {
			tags: ["Roommates"],
			summary: "Create preference catalog entry",
			description: authzNote("ADMIN only."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["name"],
							properties: {
								name: { type: "string" },
								type: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Preference" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/preferences/{id}": {
		patch: {
			tags: ["Roommates"],
			summary: "Update preference catalog entry",
			description: authzNote("ADMIN only."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Preference id")],
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								name: { type: "string" },
								type: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/Preference" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		delete: {
			tags: ["Roommates"],
			summary: "Soft-delete preference catalog entry",
			description: authzNote("ADMIN only."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Preference id")],
			responses: {
				"200": success("Soft-deleted", { $ref: "#/components/schemas/Preference" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/roommates": {
		get: {
			tags: ["Roommates"],
			summary: "Discover roommates",
			description:
				"Active discoverable profiles only; excludes the authenticated tenant. Does not leak passwords or phones." +
				authzNote("TENANT only."),
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Roommates",
					{ type: "array", items: { $ref: "#/components/schemas/RoommateProfile" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/roommates/matches": {
		get: {
			tags: ["Roommates"],
			summary: "Roommate matches with compatibility scores",
			description:
				"Returns scored candidates (0–100). Self-excluded. Sorted by compatibility after DB filtering." +
				authzNote("TENANT only."),
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Matches",
					{ type: "array", items: { $ref: "#/components/schemas/RoommateMatch" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/roommates/{id}": {
		get: {
			tags: ["Roommates"],
			summary: "Roommate profile detail",
			description: authzNote("TENANT only. Discoverable profiles."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Roommate profile id")],
			responses: {
				"200": success("Profile", { $ref: "#/components/schemas/RoommateProfile" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
});

const viewingPaths = () => ({
	"/api/v1/viewing-requests": {
		post: {
			tags: ["Viewing Requests"],
			summary: "Create viewing request",
			description:
				"Tenant creates a request. `userId`/`propertyId`/`status` are server-derived. " +
				"Requested date must be future and inside an AVAILABLE half-open window." +
				authzNote("TENANT only."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["roomId", "requestedDate"],
							properties: {
								roomId: { type: "string", format: "uuid" },
								requestedDate: { type: "string", format: "date-time" },
								requestedTime: { type: "string" },
								message: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/ViewingRequest" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/viewing-requests/my-requests": {
		get: {
			tags: ["Viewing Requests"],
			summary: "Tenant viewing requests",
			security: bearerSecurity,
			parameters: [...paginationQuery, { name: "status", in: "query", schema: { type: "string" } }],
			responses: {
				"200": success(
					"Requests",
					{ type: "array", items: { $ref: "#/components/schemas/ViewingRequest" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/viewing-requests/managed": {
		get: {
			tags: ["Viewing Requests"],
			summary: "Managed viewing requests",
			description: authzNote("Property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Requests",
					{ type: "array", items: { $ref: "#/components/schemas/ViewingRequest" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/properties/{propertyId}/viewing-requests": {
		get: {
			tags: ["Viewing Requests"],
			summary: "Viewing requests for a property",
			security: bearerSecurity,
			parameters: [uuidParam("propertyId", "Property id"), ...paginationQuery],
			responses: {
				"200": success(
					"Requests",
					{ type: "array", items: { $ref: "#/components/schemas/ViewingRequest" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/viewing-requests/{id}": {
		get: {
			tags: ["Viewing Requests"],
			summary: "Viewing request detail",
			description: authzNote("Owning tenant, property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Viewing request id")],
			responses: {
				"200": success("Request", { $ref: "#/components/schemas/ViewingRequest" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/viewing-requests/{id}/approve": {
		patch: {
			tags: ["Viewing Requests"],
			summary: "Approve viewing request",
			description: "PENDING → APPROVED only." + authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Viewing request id")],
			responses: {
				"200": success("Approved", { $ref: "#/components/schemas/ViewingRequest" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/viewing-requests/{id}/reject": {
		patch: {
			tags: ["Viewing Requests"],
			summary: "Reject viewing request",
			description: "PENDING → REJECTED only.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Viewing request id")],
			responses: {
				"200": success("Rejected", { $ref: "#/components/schemas/ViewingRequest" }),
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/viewing-requests/{id}/cancel": {
		patch: {
			tags: ["Viewing Requests"],
			summary: "Cancel viewing request",
			description: "PENDING → CANCELLED. Owning tenant only.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Viewing request id")],
			responses: {
				"200": success("Cancelled", { $ref: "#/components/schemas/ViewingRequest" }),
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
});

const applicationPaths = () => ({
	"/api/v1/applications": {
		post: {
			tags: ["Applications"],
			summary: "Create rental application",
			description:
				"Does not create a lease. `tenantId`/`propertyId` are server-derived. " +
				"Duplicate PENDING applications for the same tenant+room return 409." +
				authzNote("TENANT only."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["roomId"],
							properties: {
								roomId: { type: "string", format: "uuid" },
								viewingRequestId: { type: "string", format: "uuid" },
								message: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Application" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/applications/my-applications": {
		get: {
			tags: ["Applications"],
			summary: "Tenant applications",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Applications",
					{ type: "array", items: { $ref: "#/components/schemas/Application" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/applications/managed": {
		get: {
			tags: ["Applications"],
			summary: "Managed applications",
			description: authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Applications",
					{ type: "array", items: { $ref: "#/components/schemas/Application" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/properties/{propertyId}/applications": {
		get: {
			tags: ["Applications"],
			summary: "Applications for a property",
			security: bearerSecurity,
			parameters: [uuidParam("propertyId", "Property id"), ...paginationQuery],
			responses: {
				"200": success(
					"Applications",
					{ type: "array", items: { $ref: "#/components/schemas/Application" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/applications/{id}": {
		get: {
			tags: ["Applications"],
			summary: "Application detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Application id")],
			responses: {
				"200": success("Application", { $ref: "#/components/schemas/Application" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/applications/{id}/approve": {
		patch: {
			tags: ["Applications"],
			summary: "Approve application",
			description:
				"Explicit action endpoint — not a generic status update. PENDING → APPROVED. Does not create a lease.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Application id")],
			responses: {
				"200": success("Approved", { $ref: "#/components/schemas/Application" }),
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/applications/{id}/reject": {
		patch: {
			tags: ["Applications"],
			summary: "Reject application",
			description: "PENDING → REJECTED.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Application id")],
			responses: {
				"200": success("Rejected", { $ref: "#/components/schemas/Application" }),
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/applications/{id}/withdraw": {
		patch: {
			tags: ["Applications"],
			summary: "Withdraw application",
			description: "PENDING → WITHDRAWN. Owning tenant only.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Application id")],
			responses: {
				"200": success("Withdrawn", { $ref: "#/components/schemas/Application" }),
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
});

const leasePaths = () => ({
	"/api/v1/leases": {
		post: {
			tags: ["Leases"],
			summary: "Create lease from approved application",
			description:
				"Derives tenant, room, rent, and deposit from the APPROVED application. Creates ACTIVE lease. " +
				"Concurrent active occupancy for the same room is rejected with 409." +
				authzNote("Property owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["applicationId", "startDate"],
							properties: {
								applicationId: { type: "string", format: "uuid" },
								startDate: { type: "string", format: "date-time" },
								endDate: {
									type: "string",
									format: "date-time",
									description: "When set, must be after startDate",
								},
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/Lease" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/leases/my-leases": {
		get: {
			tags: ["Leases"],
			summary: "Tenant leases",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Leases",
					{ type: "array", items: { $ref: "#/components/schemas/Lease" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/leases/managed": {
		get: {
			tags: ["Leases"],
			summary: "Managed leases",
			description: authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [
				...paginationQuery,
				{ name: "tenantId", in: "query", schema: { type: "string", format: "uuid" } },
			],
			responses: {
				"200": success(
					"Leases",
					{ type: "array", items: { $ref: "#/components/schemas/Lease" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/leases/{id}": {
		get: {
			tags: ["Leases"],
			summary: "Lease detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Lease id")],
			responses: {
				"200": success("Lease", { $ref: "#/components/schemas/Lease" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/leases/{id}/terminate": {
		post: {
			tags: ["Leases"],
			summary: "Terminate active lease",
			description: "ACTIVE → TERMINATED." + authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Lease id")],
			responses: {
				"200": success("Terminated", { $ref: "#/components/schemas/Lease" }),
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
});

const paymentPaths = () => ({
	"/api/v1/payments": {
		post: {
			tags: ["Payments"],
			summary: "Create Stripe rent payment",
			description:
				"BDT only. Amount is server-derived from `lease.monthlyRent`. Requires `Idempotency-Key` header. " +
				"Returns PaymentIntent `clientSecret` for the tenant client. Payment success does **not** change lease status. " +
				"Never send card numbers or CVCs to this API." +
				authzNote("TENANT owning an ACTIVE lease."),
			security: bearerSecurity,
			parameters: [
				{
					name: "Idempotency-Key",
					in: "header",
					required: true,
					schema: { type: "string", maxLength: 255 },
					example: "pay-idem-550e8400-e29b-41d4-a716-446655440000",
				},
			],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["leaseId"],
							properties: {
								leaseId: { type: "string", format: "uuid" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Payment started", { $ref: "#/components/schemas/PaymentCreateData" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/payments/my-payments": {
		get: {
			tags: ["Payments"],
			summary: "Tenant payment history",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Payments",
					{ type: "array", items: { $ref: "#/components/schemas/Payment" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/payments/managed": {
		get: {
			tags: ["Payments"],
			summary: "Managed payment history",
			description: authzNote("Owner, assigned manager, or ADMIN via lease → property."),
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Payments",
					{ type: "array", items: { $ref: "#/components/schemas/Payment" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/payments/{id}": {
		get: {
			tags: ["Payments"],
			summary: "Payment detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Payment id")],
			responses: {
				"200": success("Payment", { $ref: "#/components/schemas/Payment" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/payments/webhook/stripe": {
		post: {
			tags: ["Payments"],
			summary: "Stripe webhook",
			description:
				"Public endpoint. Requires raw JSON body and `Stripe-Signature` header verification. " +
				"Processes `payment_intent.succeeded` and `payment_intent.payment_failed`. " +
				"Idempotent via webhook event ledger. Does not expose or require Stripe secret keys from clients. " +
				"Response shape is `{ received: true }` (not the standard sendResponse envelope).",
			parameters: [
				{
					name: "Stripe-Signature",
					in: "header",
					required: true,
					schema: { type: "string" },
					example: "t=1710000000,v1=example_signature_placeholder",
				},
			],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							description: "Raw Stripe event payload (verified by signature)",
							additionalProperties: true,
						},
					},
				},
			},
			responses: {
				"200": {
					description: "Acknowledged",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/StripeWebhookAck" },
						},
					},
				},
				"400": R.BadRequest,
				"500": R.InternalError,
			},
		},
	},
});

const utilityPaths = () => ({
	"/api/v1/utility-bills": {
		post: {
			tags: ["Utility Bills"],
			summary: "Create utility bill",
			description:
				"BDT fixed-amount bills. Percentage splits and automatic Stripe charging are not implemented. " +
				"Clients cannot set currency/status/paidAt." +
				authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: [
								"propertyId",
								"type",
								"totalAmount",
								"billingPeriodStart",
								"billingPeriodEnd",
								"dueDate",
							],
							properties: {
								propertyId: { type: "string", format: "uuid" },
								unitId: { type: "string", format: "uuid" },
								type: {
									type: "string",
									enum: ["ELECTRICITY", "GAS", "WATER", "INTERNET", "OTHER"],
								},
								totalAmount: { type: "number", exclusiveMinimum: 0, example: 3500.5 },
								billingPeriodStart: { type: "string", format: "date-time" },
								billingPeriodEnd: { type: "string", format: "date-time" },
								dueDate: { type: "string", format: "date-time" },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/UtilityBill" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/utility-bills/my-bills": {
		get: {
			tags: ["Utility Bills"],
			summary: "Tenant bill visibility",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Bills",
					{ type: "array", items: { $ref: "#/components/schemas/UtilityBill" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/utility-bills/managed": {
		get: {
			tags: ["Utility Bills"],
			summary: "Managed bills",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Bills",
					{ type: "array", items: { $ref: "#/components/schemas/UtilityBill" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/utility-bills/{id}": {
		get: {
			tags: ["Utility Bills"],
			summary: "Bill detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Utility bill id")],
			responses: {
				"200": success("Bill", { $ref: "#/components/schemas/UtilityBill" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
	},
	"/api/v1/utility-bills/{id}/splits": {
		get: {
			tags: ["Utility Bills"],
			summary: "List splits",
			description: "Tenants see only their own split; operators see all for the bill.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Utility bill id")],
			responses: {
				"200": success("Splits", {
					type: "array",
					items: { $ref: "#/components/schemas/UtilityBillSplit" },
				}),
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
		post: {
			tags: ["Utility Bills"],
			summary: "Create fixed-amount split",
			description:
				"Positive amount; total allocated splits cannot exceed bill total; duplicate tenant returns 409. " +
				"Unit-scoped bills require an ACTIVE lease for that unit." +
				authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Utility bill id")],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["tenantId", "amount"],
							properties: {
								tenantId: { type: "string", format: "uuid" },
								amount: { type: "number", exclusiveMinimum: 0, example: 1750.25 },
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/UtilityBillSplit" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
});

const maintenancePaths = () => ({
	"/api/v1/maintenance-requests": {
		post: {
			tags: ["Maintenance Requests"],
			summary: "Create maintenance request",
			description:
				"Requires ACTIVE lease on the room. `tenantId`/`propertyId`/`status` are server-derived. Default priority MEDIUM." +
				authzNote("TENANT with eligible active lease."),
			security: bearerSecurity,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							required: ["roomId", "title", "description"],
							properties: {
								roomId: { type: "string", format: "uuid" },
								title: { type: "string", example: "Leaking faucet" },
								description: { type: "string" },
								priority: {
									type: "string",
									enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
								},
							},
						},
					},
				},
			},
			responses: {
				"201": success("Created", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"400": R.BadRequest,
				"401": R.Unauthorized,
				"403": R.Forbidden,
			},
		},
	},
	"/api/v1/maintenance-requests/my-requests": {
		get: {
			tags: ["Maintenance Requests"],
			summary: "Tenant maintenance requests",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Requests",
					{ type: "array", items: { $ref: "#/components/schemas/MaintenanceRequest" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/maintenance-requests/managed": {
		get: {
			tags: ["Maintenance Requests"],
			summary: "Managed maintenance requests",
			security: bearerSecurity,
			parameters: [...paginationQuery],
			responses: {
				"200": success(
					"Requests",
					{ type: "array", items: { $ref: "#/components/schemas/MaintenanceRequest" } },
					true,
				),
				"401": R.Unauthorized,
			},
		},
	},
	"/api/v1/maintenance-requests/{id}": {
		get: {
			tags: ["Maintenance Requests"],
			summary: "Maintenance request detail",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Maintenance request id")],
			responses: {
				"200": success("Request", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"404": R.NotFound,
			},
		},
		patch: {
			tags: ["Maintenance Requests"],
			summary: "Update safe fields",
			description:
				"Tenants may edit title/description/priority only while OPEN. Operators have broader edit rights. Status is not client-controlled here.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Maintenance request id")],
			requestBody: {
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								title: { type: "string" },
								description: { type: "string" },
								priority: {
									type: "string",
									enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
								},
							},
						},
					},
				},
			},
			responses: {
				"200": success("Updated", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/maintenance-requests/{id}/start": {
		post: {
			tags: ["Maintenance Requests"],
			summary: "Start work (OPEN → IN_PROGRESS)",
			description: authzNote("Owner, assigned manager, or ADMIN."),
			security: bearerSecurity,
			parameters: [uuidParam("id", "Maintenance request id")],
			responses: {
				"200": success("Started", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"403": R.Forbidden,
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/maintenance-requests/{id}/resolve": {
		post: {
			tags: ["Maintenance Requests"],
			summary: "Resolve (IN_PROGRESS → RESOLVED)",
			description: "Sets `resolvedAt` server-side.",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Maintenance request id")],
			responses: {
				"200": success("Resolved", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"409": R.Conflict,
			},
		},
	},
	"/api/v1/maintenance-requests/{id}/close": {
		post: {
			tags: ["Maintenance Requests"],
			summary: "Close (RESOLVED → CLOSED)",
			security: bearerSecurity,
			parameters: [uuidParam("id", "Maintenance request id")],
			responses: {
				"200": success("Closed", { $ref: "#/components/schemas/MaintenanceRequest" }),
				"409": R.Conflict,
			},
		},
	},
});

const auditPaths = () => ({
	"/api/v1/audit-logs": {
		get: {
			tags: ["Audit Logs"],
			summary: "List audit logs",
			description:
				"Immutable, read-only audit records. No create/update/delete endpoints." +
				authzNote("ADMIN only."),
			security: bearerSecurity,
			parameters: [
				{
					name: "page",
					in: "query",
					schema: { type: "integer", minimum: 1, default: 1 },
				},
				{
					name: "limit",
					in: "query",
					schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
				},
				{ name: "action", in: "query", schema: { type: "string" } },
				{ name: "entityType", in: "query", schema: { type: "string" } },
				{ name: "entityId", in: "query", schema: { type: "string", format: "uuid" } },
				{ name: "actorUserId", in: "query", schema: { type: "string", format: "uuid" } },
				{ name: "from", in: "query", schema: { type: "string", format: "date-time" } },
				{ name: "to", in: "query", schema: { type: "string", format: "date-time" } },
				{
					name: "sortOrder",
					in: "query",
					schema: { type: "string", enum: ["asc", "desc"] },
				},
			],
			responses: {
				"200": success(
					"Audit logs",
					{ type: "array", items: { $ref: "#/components/schemas/AuditLog" } },
					true,
				),
				"401": R.Unauthorized,
				"403": R.Forbidden,
				"400": R.BadRequest,
			},
		},
	},
});
