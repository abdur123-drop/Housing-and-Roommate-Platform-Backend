import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UtilityBillController } from "./utilityBill.controller";
import { UtilityBillValidation } from "./utilityBill.validation";

const router = Router();

router.post(
	"/utility-bills",
	auth(),
	validateRequest(UtilityBillValidation.CreateUtilityBillZodSchema),
	UtilityBillController.createUtilityBill,
);
router.get("/utility-bills/my-bills", auth(), UtilityBillController.getMyBills);
router.get(
	"/utility-bills/managed",
	auth(),
	UtilityBillController.getManagedBills,
);
router.get(
	"/utility-bills/:id/splits",
	auth(),
	UtilityBillController.getSplits,
);
router.post(
	"/utility-bills/:id/splits",
	auth(),
	validateRequest(UtilityBillValidation.CreateUtilitySplitZodSchema),
	UtilityBillController.createSplit,
);
router.get(
	"/utility-bills/:id",
	auth(),
	UtilityBillController.getUtilityBillById,
);

export const UtilityBillRoutes = router;
