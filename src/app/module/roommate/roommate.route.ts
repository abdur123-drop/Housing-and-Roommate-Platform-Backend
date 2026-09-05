import { Router } from "express";
import { AppRole } from "../../constants/roles";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { RoommateController } from "./roommate.controller";
import { RoommateValidation } from "./roommate.validation";

const router = Router();

router.post(
	"/roommate-profile",
	auth(AppRole.TENANT),
	validateRequest(RoommateValidation.CreateRoommateProfileZodSchema),
	RoommateController.createProfile,
);

router.get(
	"/roommate-profile/me",
	auth(AppRole.TENANT),
	RoommateController.getMyProfile,
);

router.patch(
	"/roommate-profile/me",
	auth(AppRole.TENANT),
	validateRequest(RoommateValidation.UpdateRoommateProfileZodSchema),
	RoommateController.updateMyProfile,
);

router.delete(
	"/roommate-profile/me",
	auth(AppRole.TENANT),
	RoommateController.deleteMyProfile,
);

router.get(
	"/roommate-preferences/me",
	auth(AppRole.TENANT),
	RoommateController.getMyPreferences,
);

router.put(
	"/roommate-preferences/me",
	auth(AppRole.TENANT),
	validateRequest(RoommateValidation.UpsertMyPreferencesZodSchema),
	RoommateController.updateMyPreferences,
);

router.get("/preferences", auth(), RoommateController.getPreferences);

router.post(
	"/preferences",
	auth(AppRole.ADMIN),
	validateRequest(RoommateValidation.CreatePreferenceZodSchema),
	RoommateController.createPreference,
);

router.patch(
	"/preferences/:id",
	auth(AppRole.ADMIN),
	validateRequest(RoommateValidation.UpdatePreferenceZodSchema),
	RoommateController.updatePreference,
);

router.delete(
	"/preferences/:id",
	auth(AppRole.ADMIN),
	RoommateController.deletePreference,
);

router.get(
	"/roommates/matches",
	auth(AppRole.TENANT),
	RoommateController.getMatches,
);

router.get(
	"/roommates/:id",
	auth(AppRole.TENANT),
	RoommateController.getProfileById,
);

router.get(
	"/roommates",
	auth(AppRole.TENANT),
	RoommateController.discoverRoommates,
);

export const RoommateRoutes = router;
