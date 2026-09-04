import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { BuildingController } from "./building.controller";
import { BuildingValidation } from "./building.validation";

const router = Router();

router.post(
	"/properties/:propertyId/buildings",
	auth(),
	validateRequest(BuildingValidation.CreateBuildingZodSchema),
	BuildingController.createBuilding,
);

router.get(
	"/properties/:propertyId/buildings",
	auth(),
	BuildingController.listBuildings,
);

router.get("/buildings/:id", auth(), BuildingController.getBuildingById);

router.patch(
	"/buildings/:id",
	auth(),
	validateRequest(BuildingValidation.UpdateBuildingZodSchema),
	BuildingController.updateBuilding,
);

router.delete("/buildings/:id", auth(), BuildingController.deleteBuilding);

export const BuildingRoutes = router;
