import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { RoomController } from "./room.controller";
import { RoomValidation } from "./room.validation";

const router = Router();

router.post(
	"/units/:unitId/rooms",
	auth(),
	validateRequest(RoomValidation.CreateRoomZodSchema),
	RoomController.createRoom,
);

router.get("/units/:unitId/rooms", auth(), RoomController.listRooms);

router.get("/rooms/:id", auth(), RoomController.getRoomById);

router.patch(
	"/rooms/:id",
	auth(),
	validateRequest(RoomValidation.UpdateRoomZodSchema),
	RoomController.updateRoom,
);

router.delete("/rooms/:id", auth(), RoomController.deleteRoom);

export const RoomRoutes = router;
