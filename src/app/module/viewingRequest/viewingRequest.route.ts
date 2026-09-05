import { Router } from "express";
import { AppRole } from "../../constants/roles";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ViewingRequestController } from "./viewingRequest.controller";
import { ViewingRequestValidation } from "./viewingRequest.validation";

const router = Router();

router.post(
	"/viewing-requests",
	auth(AppRole.TENANT),
	validateRequest(ViewingRequestValidation.CreateViewingRequestZodSchema),
	ViewingRequestController.createViewingRequest,
);

router.get(
	"/viewing-requests/my-requests",
	auth(AppRole.TENANT),
	ViewingRequestController.getMyViewingRequests,
);

router.get(
	"/viewing-requests/managed",
	auth(),
	ViewingRequestController.getManagedViewingRequests,
);

router.get(
	"/properties/:propertyId/viewing-requests",
	auth(),
	ViewingRequestController.getPropertyViewingRequests,
);

router.get(
	"/viewing-requests/:id",
	auth(),
	ViewingRequestController.getViewingRequestById,
);

router.patch(
	"/viewing-requests/:id/approve",
	auth(),
	validateRequest(ViewingRequestValidation.ViewingRequestActionZodSchema),
	ViewingRequestController.approveViewingRequest,
);

router.patch(
	"/viewing-requests/:id/reject",
	auth(),
	validateRequest(ViewingRequestValidation.ViewingRequestActionZodSchema),
	ViewingRequestController.rejectViewingRequest,
);

router.patch(
	"/viewing-requests/:id/cancel",
	auth(AppRole.TENANT),
	validateRequest(ViewingRequestValidation.ViewingRequestActionZodSchema),
	ViewingRequestController.cancelViewingRequest,
);

export const ViewingRequestRoutes = router;
