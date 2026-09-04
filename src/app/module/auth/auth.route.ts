import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	validateRequest(AuthValidation.RegisterZodSchema),
	AuthController.register,
);

router.post(
	"/login",
	validateRequest(AuthValidation.LoginZodSchema),
	AuthController.login,
);

router.post(
	"/refresh-token",
	validateRequest(AuthValidation.RefreshTokenZodSchema),
	AuthController.refreshToken,
);

// Not behind auth(): a client whose access token has already expired must still
// be able to log out and have its refresh token revoked.
router.post("/logout", AuthController.logout);

// auth() with no arguments: any authenticated, active user. Role-specific
// authorization is Step 5.
router.get("/me", auth(), AuthController.getMe);

export const AuthRoutes = router;
