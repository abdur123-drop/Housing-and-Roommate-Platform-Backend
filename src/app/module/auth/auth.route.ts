import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { normalizeRateLimitEmail, redisRateLimit } from "../../middleware/rateLimit";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	redisRateLimit({ namespace: "register-ip", limit: 10, windowSeconds: 3600, keyGenerator: (req) => req.ip ?? "unknown" }),
	validateRequest(AuthValidation.RegisterZodSchema),
	AuthController.register,
);

router.post(
	"/login",
	redisRateLimit({ namespace: "login-ip", limit: 20, windowSeconds: 60, keyGenerator: (req) => req.ip ?? "unknown" }),
	redisRateLimit({ namespace: "login-account", limit: 8, windowSeconds: 300, keyGenerator: (req) => normalizeRateLimitEmail(req.body?.email) }),
	validateRequest(AuthValidation.LoginZodSchema),
	AuthController.login,
);

router.post(
	"/refresh-token",
	redisRateLimit({ namespace: "refresh-ip", limit: 30, windowSeconds: 60, keyGenerator: (req) => req.ip ?? "unknown" }),
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
