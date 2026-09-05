import { Router } from "express";
import { AppRole } from "../../constants/roles";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ApplicationController } from "./application.controller";
import { ApplicationValidation } from "./application.validation";

const router = Router();

router.post(
	"/applications",
	auth(AppRole.TENANT),
	validateRequest(ApplicationValidation.CreateApplicationZodSchema),
	ApplicationController.createApplication,
);

router.get(
	"/applications/my-applications",
	auth(AppRole.TENANT),
	ApplicationController.getMyApplications,
);

router.get(
	"/applications/managed",
	auth(),
	ApplicationController.getManagedApplications,
);

router.get(
	"/properties/:propertyId/applications",
	auth(),
	ApplicationController.getPropertyApplications,
);

router.get(
	"/applications/:id",
	auth(),
	ApplicationController.getApplicationById,
);

router.patch(
	"/applications/:id/approve",
	auth(),
	validateRequest(ApplicationValidation.ApplicationActionZodSchema),
	ApplicationController.approveApplication,
);

router.patch(
	"/applications/:id/reject",
	auth(),
	validateRequest(ApplicationValidation.ApplicationActionZodSchema),
	ApplicationController.rejectApplication,
);

router.patch(
	"/applications/:id/withdraw",
	auth(AppRole.TENANT),
	validateRequest(ApplicationValidation.ApplicationActionZodSchema),
	ApplicationController.withdrawApplication,
);

export const ApplicationRoutes = router;
