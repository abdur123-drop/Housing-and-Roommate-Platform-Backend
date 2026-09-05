import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { MaintenanceRequestController } from "./maintenanceRequest.controller";
import { MaintenanceRequestValidation } from "./maintenanceRequest.validation";

const router = Router();

router.post(
	"/maintenance-requests",
	auth(),
	validateRequest(
		MaintenanceRequestValidation.CreateMaintenanceRequestZodSchema,
	),
	MaintenanceRequestController.createRequest,
);
router.get(
	"/maintenance-requests/my-requests",
	auth(),
	MaintenanceRequestController.getMyRequests,
);
router.get(
	"/maintenance-requests/managed",
	auth(),
	MaintenanceRequestController.getManagedRequests,
);
router.patch(
	"/maintenance-requests/:id",
	auth(),
	validateRequest(
		MaintenanceRequestValidation.UpdateMaintenanceRequestZodSchema,
	),
	MaintenanceRequestController.updateRequest,
);
router.post(
	"/maintenance-requests/:id/start",
	auth(),
	MaintenanceRequestController.startRequest,
);
router.post(
	"/maintenance-requests/:id/resolve",
	auth(),
	MaintenanceRequestController.resolveRequest,
);
router.post(
	"/maintenance-requests/:id/close",
	auth(),
	MaintenanceRequestController.closeRequest,
);
router.get(
	"/maintenance-requests/:id",
	auth(),
	MaintenanceRequestController.getRequestById,
);

export const MaintenanceRequestRoutes = router;
