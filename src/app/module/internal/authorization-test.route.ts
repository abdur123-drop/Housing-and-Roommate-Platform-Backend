import { Router } from "express";
import httpStatus from "http-status";
import { z } from "zod";
import { AppRole } from "../../constants/roles";
import {
	requirePropertyAccess,
	requirePropertyManager,
	requirePropertyOwner,
	requirePropertyResourceAccess,
	requireTenantResource,
	type TenantResource,
} from "../../middleware/authorize";
import { auth } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

const router = Router();
const tenantResourceSchema = z.enum([
	"roommateProfile",
	"userPreference",
	"viewingRequest",
	"application",
	"lease",
	"rentPayment",
	"utilityBillSplit",
	"maintenanceRequest",
]);

const ok = catchAsync(async (_req, res) => {
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Authorization check passed",
		data: null,
	});
});

router.get("/roles/admin", auth(AppRole.ADMIN), ok);
router.get("/roles/owner", auth(AppRole.OWNER), ok);
router.get("/roles/tenant", auth(AppRole.TENANT), ok);

router.get("/properties/:propertyId/owner", auth(), requirePropertyOwner(), ok);

router.get(
	"/properties/:propertyId/manager",
	auth(),
	requirePropertyManager(),
	ok,
);

router.get(
	"/properties/:propertyId/access",
	auth(),
	requirePropertyAccess(),
	ok,
);

router.get(
	"/properties/:propertyId/rooms/:roomId/access",
	auth(),
	requirePropertyResourceAccess("room", "access", {
		idParam: "roomId",
		propertyIdParam: "propertyId",
	}),
	ok,
);

router.get(
	"/tenant/:resource/:id",
	auth(AppRole.TENANT),
	(req, res, next) => {
		const resource = tenantResourceSchema.safeParse(req.params.resource);

		if (!resource.success) {
			res.status(httpStatus.BAD_REQUEST).json({
				success: false,
				statusCode: httpStatus.BAD_REQUEST,
				message: "Invalid tenant resource",
				errors: [
					{
						path: "resource",
						message: "resource is not supported for authorization tests",
					},
				],
			});
			return;
		}

		requireTenantResource(resource.data as TenantResource)(req, res, next);
	},
	ok,
);

export const AuthorizationTestRoutes = router;
