import Stripe from "stripe";
import config from "../config";

let stripeClient: Stripe | undefined;
let testWebhookSecret: string | undefined;

export const getStripe = (): Stripe => {
	if (stripeClient) return stripeClient;
	if (!config.stripe_secret_key) {
		throw new Error("STRIPE_SECRET_KEY is not configured");
	}

	stripeClient = new Stripe(config.stripe_secret_key);
	return stripeClient;
};

export const getStripeWebhookSecret = (): string => {
	const secret = testWebhookSecret ?? config.stripe_webhook_secret;
	if (!secret) {
		throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
	}
	return secret;
};

export const resetStripeForTest = (): void => {
	stripeClient = undefined;
	testWebhookSecret = undefined;
};

export const setStripeForTest = (client: Stripe): void => {
	stripeClient = client;
};

export const setStripeWebhookSecretForTest = (secret: string): void => {
	testWebhookSecret = secret;
};
