import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UnitController } from "./unit.controller";
import { UnitValidation } from "./unit.validation";

const router = Router();

router.post(
	"/buildings/:buildingId/units",
	auth(),
	validateRequest(UnitValidation.CreateUnitZodSchema),
	UnitController.createUnit,
);

router.get("/buildings/:buildingId/units", auth(), UnitController.listUnits);

router.get("/units/:id", auth(), UnitController.getUnitById);

router.patch(
	"/units/:id",
	auth(),
	validateRequest(UnitValidation.UpdateUnitZodSchema),
	UnitController.updateUnit,
);

router.delete("/units/:id", auth(), UnitController.deleteUnit);

export const UnitRoutes = router;
