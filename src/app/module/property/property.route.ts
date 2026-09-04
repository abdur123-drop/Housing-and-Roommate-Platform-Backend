import { Router } from "express";
import { AppRole } from "../../constants/roles";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PropertyController } from "./property.controller";
import { PropertyValidation } from "./property.validation";

const router = Router();

router.get("/", PropertyController.getProperties);

router.get(
	"/my-properties",
	auth(AppRole.OWNER, AppRole.ADMIN),
	PropertyController.getMyProperties,
);

router.post(
	"/",
	auth(AppRole.OWNER, AppRole.ADMIN),
	validateRequest(PropertyValidation.CreatePropertyZodSchema),
	PropertyController.createProperty,
);

router.get("/:id", PropertyController.getPropertyById);

router.patch(
	"/:id",
	auth(),
	validateRequest(PropertyValidation.UpdatePropertyZodSchema),
	PropertyController.updateProperty,
);

router.delete(
	"/:id",
	auth(AppRole.OWNER, AppRole.ADMIN),
	PropertyController.deleteProperty,
);

router.patch(
	"/:id/manager",
	auth(AppRole.OWNER, AppRole.ADMIN),
	validateRequest(PropertyValidation.AssignManagerZodSchema),
	PropertyController.assignManager,
);

export const PropertyRoutes = router;
