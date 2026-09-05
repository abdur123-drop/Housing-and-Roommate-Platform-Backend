import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { RoomAvailabilityController } from "./roomAvailability.controller";
import { RoomAvailabilityValidation } from "./roomAvailability.validation";

const router = Router();

router.post(
	"/rooms/:roomId/availability",
	auth(),
	validateRequest(RoomAvailabilityValidation.CreateRoomAvailabilityZodSchema),
	RoomAvailabilityController.createAvailability,
);

router.get(
	"/rooms/:roomId/availability",
	auth(),
	RoomAvailabilityController.listAvailability,
);

router.get(
	"/room-availability/:id",
	auth(),
	RoomAvailabilityController.getAvailabilityById,
);

router.patch(
	"/room-availability/:id",
	auth(),
	validateRequest(RoomAvailabilityValidation.UpdateRoomAvailabilityZodSchema),
	RoomAvailabilityController.updateAvailability,
);

router.delete(
	"/room-availability/:id",
	auth(),
	RoomAvailabilityController.deleteAvailability,
);

export const RoomAvailabilityRoutes = router;
