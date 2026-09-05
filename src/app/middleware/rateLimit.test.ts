import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redisRateLimit } from "./rateLimit";

describe("Redis rate limiting", () => {
	it("fails closed when security Redis is unavailable", async () => {
		const middleware = redisRateLimit({ namespace: "test", limit: 1, windowSeconds: 60, keyGenerator: () => "identity" });
		const error = await new Promise<unknown>((resolve) => {
			middleware({} as never, { setHeader: () => undefined } as never, resolve);
		});
		assert.equal((error as { statusCode: number }).statusCode, 503);
	});
});
