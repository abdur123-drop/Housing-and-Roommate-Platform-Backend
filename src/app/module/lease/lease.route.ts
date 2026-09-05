import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { LeaseController } from "./lease.controller";
import { LeaseValidation } from "./lease.validation";

const router = Router();

router.post(
	"/leases",
	auth(),
	validateRequest(LeaseValidation.CreateLeaseZodSchema),
	LeaseController.createLease,
);
router.get("/leases/my-leases", auth(), LeaseController.getMyLeases);
router.get("/leases/managed", auth(), LeaseController.getManagedLeases);
router.get("/leases/:id", auth(), LeaseController.getLeaseById);
router.post("/leases/:id/terminate", auth(), LeaseController.terminateLease);

export const LeaseRoutes = router;
