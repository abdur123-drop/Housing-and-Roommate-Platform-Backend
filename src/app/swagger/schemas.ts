/**
 * Reusable OpenAPI component schemas aligned with sendResponse / globalErrorHandler
 * and module DTOs. Keep examples fake — never real secrets or credentials.
 */

const uuidExample = "550e8400-e29b-41d4-a716-446655440000";
const emailExample = "user@example.com";

export const sharedSchemas = {
	SuccessMeta: {
		type: "object",
		properties: {
			page: { type: "integer", example: 1 },
			limit: { type: "integer", example: 10 },
			total: { type: "integer", example: 25 },
			totalPage: { type: "integer", example: 3 },
		},
	},
	ErrorSource: {
		type: "object",
		properties: {
			path: { type: "string", example: "email" },
			message: { type: "string", example: "Please provide a valid email address" },
		},
	},
	ErrorResponse: {
		type: "object",
		required: ["success", "statusCode", "message", "errors"],
		properties: {
			success: { type: "boolean", example: false },
			statusCode: { type: "integer", example: 400 },
			name: {
				type: "string",
				description: "Present only when NODE_ENV=development",
				example: "ZodError",
			},
			message: { type: "string", example: "Validation failed" },
			errors: {
				type: "array",
				items: { $ref: "#/components/schemas/ErrorSource" },
			},
			stack: {
				type: "string",
				description: "Present only when NODE_ENV=development",
			},
		},
	},
	AuthUser: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid", example: uuidExample },
			name: { type: "string", example: "Alex Owner" },
			email: { type: "string", format: "email", example: emailExample },
			phone: { type: "string", nullable: true, example: "+8801700000000" },
			avatar: { type: "string", nullable: true },
			roles: {
				type: "array",
				items: { type: "string", enum: ["OWNER", "TENANT", "ADMIN"] },
				example: ["OWNER"],
			},
			createdAt: { type: "string", format: "date-time" },
		},
	},
	AuthSessionData: {
		type: "object",
		properties: {
			user: { $ref: "#/components/schemas/AuthUser" },
			accessToken: {
				type: "string",
				description:
					"JWT access token. Prefer Authorization: Bearer. Also set as HttpOnly accessToken cookie.",
				example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.payload",
			},
		},
	},
	PublicProperty: {
		type: "object",
		description:
			"Safe public property DTO. Does not expose ownerId, managerId, deletedAt, or private user data.",
		properties: {
			id: { type: "string", format: "uuid", example: uuidExample },
			title: { type: "string", example: "Sunny Apartment in Gulshan" },
			description: { type: "string", nullable: true },
			propertyType: {
				type: "string",
				enum: ["APARTMENT", "HOUSE", "BUILDING", "CONDO", "VILLA", "OTHER"],
			},
			address: { type: "string" },
			city: { type: "string", example: "Dhaka" },
			state: { type: "string", nullable: true },
			country: { type: "string", example: "Bangladesh" },
			zipCode: { type: "string", nullable: true },
			latitude: { type: "number", nullable: true },
			longitude: { type: "number", nullable: true },
			status: {
				type: "string",
				enum: ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"],
			},
			minMonthlyRent: { type: "number", nullable: true, example: 15000 },
			maxMonthlyRent: { type: "number", nullable: true, example: 25000 },
			availableRoomCount: { type: "integer", example: 2 },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	ManagedProperty: {
		type: "object",
		description: "Owner/manager/admin property view including relationship IDs.",
		properties: {
			id: { type: "string", format: "uuid" },
			title: { type: "string" },
			description: { type: "string", nullable: true },
			propertyType: { type: "string" },
			address: { type: "string" },
			city: { type: "string" },
			state: { type: "string", nullable: true },
			country: { type: "string" },
			zipCode: { type: "string", nullable: true },
			latitude: { type: "number", nullable: true },
			longitude: { type: "number", nullable: true },
			status: { type: "string" },
			ownerId: { type: "string", format: "uuid" },
			managerId: {
				type: "string",
				format: "uuid",
				nullable: true,
				description:
					"Assigned property manager user id. Relationship-based access, not a global RBAC role.",
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Building: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			propertyId: { type: "string", format: "uuid" },
			name: { type: "string", example: "Tower A" },
			description: { type: "string", nullable: true },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Unit: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			buildingId: { type: "string", format: "uuid" },
			unitNumber: { type: "string", example: "5B" },
			floor: { type: "integer", nullable: true },
			bedrooms: { type: "integer", nullable: true },
			bathrooms: { type: "number", nullable: true },
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
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Room: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			unitId: { type: "string", format: "uuid" },
			roomNumber: { type: "string", example: "R1" },
			name: { type: "string", nullable: true },
			roomType: {
				type: "string",
				enum: ["PRIVATE", "SHARED", "MASTER", "STUDIO"],
			},
			monthlyRent: { type: "string", description: "DECIMAL as string", example: "18000.00" },
			securityDeposit: {
				type: "string",
				nullable: true,
				description: "DECIMAL as string",
			},
			status: {
				type: "string",
				enum: ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE", "UNAVAILABLE"],
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	RoomAvailability: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			roomId: { type: "string", format: "uuid" },
			availableFrom: {
				type: "string",
				format: "date-time",
				description: "Inclusive start of the half-open availability interval",
			},
			availableTo: {
				type: "string",
				format: "date-time",
				nullable: true,
				description: "Exclusive end when set (half-open interval)",
			},
			status: {
				type: "string",
				enum: ["AVAILABLE", "UNAVAILABLE", "RESERVED", "OCCUPIED"],
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	RoommateProfile: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			bio: { type: "string", nullable: true },
			occupation: { type: "string", nullable: true },
			budgetMin: { type: "number", nullable: true },
			budgetMax: { type: "number", nullable: true },
			preferredLocation: { type: "string", nullable: true },
			moveInDate: { type: "string", format: "date-time", nullable: true },
			smoking: { type: "boolean", nullable: true },
			pets: { type: "boolean", nullable: true },
			genderPreference: { type: "string", nullable: true },
			isDiscoverable: { type: "boolean" },
			user: {
				type: "object",
				properties: {
					id: { type: "string", format: "uuid" },
					name: { type: "string" },
					avatar: { type: "string", nullable: true },
				},
			},
			preferences: {
				type: "array",
				items: {
					type: "object",
					properties: {
						preferenceId: { type: "string", format: "uuid" },
						name: { type: "string" },
						type: { type: "string", nullable: true },
						value: { type: "string", nullable: true },
					},
				},
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	RoommateMatch: {
		type: "object",
		properties: {
			profile: { $ref: "#/components/schemas/RoommateProfile" },
			compatibilityScore: {
				type: "integer",
				minimum: 0,
				maximum: 100,
				description:
					"Deterministic 0–100 score. Weights: budget 30%, location 20%, move-in 15%, lifestyle 20%, preferences 15%. Missing dimensions are normalized; neutral default is 50.",
				example: 78,
			},
			breakdown: {
				type: "object",
				properties: {
					budget: { type: "number", nullable: true },
					location: { type: "number", nullable: true },
					moveIn: { type: "number", nullable: true },
					lifestyle: { type: "number", nullable: true },
					preferences: { type: "number", nullable: true },
				},
			},
		},
	},
	ViewingRequest: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			userId: { type: "string", format: "uuid" },
			propertyId: { type: "string", format: "uuid" },
			roomId: { type: "string", format: "uuid" },
			requestedDate: { type: "string", format: "date-time" },
			requestedTime: { type: "string", nullable: true },
			message: { type: "string", nullable: true },
			status: {
				type: "string",
				enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"],
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Application: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			userId: { type: "string", format: "uuid" },
			roomId: { type: "string", format: "uuid" },
			viewingRequestId: { type: "string", format: "uuid", nullable: true },
			message: { type: "string", nullable: true },
			status: {
				type: "string",
				enum: ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN"],
			},
			submittedAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Lease: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			applicationId: { type: "string", format: "uuid" },
			tenantId: { type: "string", format: "uuid" },
			roomId: { type: "string", format: "uuid" },
			startDate: { type: "string", format: "date-time" },
			endDate: { type: "string", format: "date-time", nullable: true },
			monthlyRent: { type: "string", example: "18000.00" },
			securityDeposit: { type: "string", nullable: true },
			status: {
				type: "string",
				enum: ["PENDING", "ACTIVE", "EXPIRED", "TERMINATED"],
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	Payment: {
		type: "object",
		description:
			"Local rent payment record. Amount is BDT. Does not include Stripe secret keys or card data.",
		properties: {
			id: { type: "string", format: "uuid" },
			leaseId: { type: "string", format: "uuid" },
			tenantId: { type: "string", format: "uuid" },
			amount: { type: "string", example: "18000.00" },
			currency: { type: "string", example: "BDT" },
			dueDate: { type: "string", format: "date-time", nullable: true },
			paidAt: { type: "string", format: "date-time", nullable: true },
			status: {
				type: "string",
				enum: [
					"PENDING",
					"PROCESSING",
					"PAID",
					"LATE",
					"FAILED",
					"REFUNDED",
					"CANCELLED",
				],
			},
			paymentMethod: { type: "string", nullable: true },
			provider: { type: "string", nullable: true, example: "STRIPE" },
			providerPaymentId: { type: "string", nullable: true },
			providerSessionId: { type: "string", nullable: true },
			providerStatus: { type: "string", nullable: true },
			failureReason: { type: "string", nullable: true },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	PaymentCreateData: {
		type: "object",
		properties: {
			payment: { $ref: "#/components/schemas/Payment" },
			clientSecret: {
				type: "string",
				description:
					"Stripe PaymentIntent client secret for the tenant client. Placeholder only — never a real secret.",
				example: "pi_example_secret_placeholder",
			},
		},
	},
	UtilityBill: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			propertyId: { type: "string", format: "uuid" },
			unitId: { type: "string", format: "uuid", nullable: true },
			type: {
				type: "string",
				enum: ["ELECTRICITY", "GAS", "WATER", "INTERNET", "OTHER"],
			},
			totalAmount: { type: "number", example: 3500.5 },
			currency: { type: "string", example: "BDT" },
			billingPeriodStart: { type: "string", format: "date-time" },
			billingPeriodEnd: { type: "string", format: "date-time" },
			dueDate: { type: "string", format: "date-time" },
			status: {
				type: "string",
				enum: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"],
			},
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	UtilityBillSplit: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			utilityBillId: { type: "string", format: "uuid" },
			tenantId: { type: "string", format: "uuid" },
			amount: { type: "number", example: 1750.25 },
			status: { type: "string", enum: ["PENDING", "PAID", "OVERDUE"] },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	MaintenanceRequest: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			tenantId: { type: "string", format: "uuid" },
			propertyId: { type: "string", format: "uuid" },
			roomId: { type: "string", format: "uuid" },
			title: { type: "string", example: "Leaking faucet" },
			description: { type: "string" },
			priority: {
				type: "string",
				enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
			},
			status: {
				type: "string",
				enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
			},
			assignedTo: { type: "string", format: "uuid", nullable: true },
			resolvedAt: { type: "string", format: "date-time", nullable: true },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	AuditLog: {
		type: "object",
		description: "Immutable audit record. ADMIN read-only.",
		properties: {
			id: { type: "string", format: "uuid" },
			actorUserId: { type: "string", format: "uuid", nullable: true },
			action: { type: "string", example: "PROPERTY_CREATED" },
			entityType: { type: "string", example: "PROPERTY" },
			entityId: { type: "string", format: "uuid" },
			oldValue: { type: "object", nullable: true, additionalProperties: true },
			newValue: { type: "object", nullable: true, additionalProperties: true },
			metadata: {
				type: "object",
				nullable: true,
				additionalProperties: true,
				description: "Sanitized metadata — secrets and credentials are stripped",
			},
			createdAt: { type: "string", format: "date-time" },
			actor: {
				type: "object",
				nullable: true,
				properties: {
					id: { type: "string", format: "uuid" },
					name: { type: "string" },
					email: { type: "string", format: "email" },
				},
			},
		},
	},
	Preference: {
		type: "object",
		properties: {
			id: { type: "string", format: "uuid" },
			name: { type: "string", example: "Night owl" },
			type: { type: "string", nullable: true },
			createdAt: { type: "string", format: "date-time" },
			updatedAt: { type: "string", format: "date-time" },
		},
	},
	StripeWebhookAck: {
		type: "object",
		properties: {
			received: { type: "boolean", example: true },
		},
	},
} as const;

export const commonResponses = {
	BadRequest: {
		description: "Validation failed or bad request",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 400,
					message: "Validation failed",
					errors: [{ path: "email", message: "Please provide a valid email address" }],
				},
			},
		},
	},
	Unauthorized: {
		description: "Missing or invalid access token",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 401,
					message: "Invalid authentication token.",
					errors: [],
				},
			},
		},
	},
	Forbidden: {
		description: "Authenticated but not authorized for this resource",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 403,
					message: "You are not allowed to perform this action",
					errors: [],
				},
			},
		},
	},
	NotFound: {
		description: "Resource not found or soft-deleted",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 404,
					message: "Resource not found",
					errors: [],
				},
			},
		},
	},
	Conflict: {
		description: "Conflict (duplicate, invalid transition, overlap)",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 409,
					message: "That value is already in use.",
					errors: [],
				},
			},
		},
	},
	TooManyRequests: {
		description:
			"Rate limit exceeded (auth register/login/refresh). Retry-After header is set.",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 429,
					message: "Too many requests. Please try again later.",
					errors: [],
				},
			},
		},
	},
	InternalError: {
		description: "Unexpected server error (message masked outside development)",
		content: {
			"application/json": {
				schema: { $ref: "#/components/schemas/ErrorResponse" },
				example: {
					success: false,
					statusCode: 500,
					message: "Internal Server Error",
					errors: [],
				},
			},
		},
	},
} as const;

export const bearerSecurity = [{ bearerAuth: [] }];

export const paginationQuery = [
	{
		name: "page",
		in: "query" as const,
		schema: { type: "integer", minimum: 1, default: 1 },
	},
	{
		name: "limit",
		in: "query" as const,
		schema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
	},
	{
		name: "sortOrder",
		in: "query" as const,
		schema: { type: "string", enum: ["asc", "desc"] },
	},
];

export const uuidParam = (name: string, description: string) => ({
	name,
	in: "path" as const,
	required: true,
	schema: { type: "string", format: "uuid" },
	description,
	example: uuidExample,
});
