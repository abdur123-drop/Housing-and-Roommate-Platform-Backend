import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const router = Router();

router.post(
	"/payments",
	auth(),
	validateRequest(PaymentValidation.CreatePaymentZodSchema),
	PaymentController.createPayment,
);
router.get("/payments/my-payments", auth(), PaymentController.getMyPayments);
router.get("/payments/managed", auth(), PaymentController.getManagedPayments);
router.get("/payments/:id", auth(), PaymentController.getPaymentById);

export const PaymentRoutes = router;

export const StripeWebhookRoutes = Router();
StripeWebhookRoutes.post("/", PaymentController.stripeWebhook);
