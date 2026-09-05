import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getJsonCache, getPropertyCacheVersion, redisKeys } from "./cache";
import { normalizeRateLimitEmail } from "../middleware/rateLimit";

describe("Redis security helpers", () => {
	it("normalizes identifiers and hashes Redis keys", () => {
		assert.equal(normalizeRateLimitEmail(" User@Example.COM "), "user@example.com");
		const key = redisKeys.rateLimit("login", "user@example.com");
		assert.equal(key.startsWith("housing:ratelimit:login:"), true);
		assert.equal(key.includes("user@example.com"), false);
	});

	it("fails open for non-critical cache reads when Redis is not configured", async () => {
		assert.equal(await getJsonCache("housing:cache:test"), null);
		assert.equal(await getPropertyCacheVersion(), "disabled");
	});
});
