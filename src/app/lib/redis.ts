import crypto from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import config from "../config";

export const redisClient = createClient({ url: config.redis_url });
let connectPromise: Promise<void> | undefined;

redisClient.on("error", () => undefined);

export const ensureRedis = async (): Promise<boolean> => {
	if (!config.redis_url) return false;
	if (redisClient.isReady) return true;
	connectPromise ??= redisClient.connect().catch(() => undefined).then(() => undefined);
	await connectPromise;
	return redisClient.isReady;
};

export const disconnectRedis = async (): Promise<void> => {
	connectPromise = undefined;
	if (redisClient.isOpen) await redisClient.quit().catch(() => undefined);
};

const namespace = "housing";
export const redisKeys = {
	rateLimit: (kind: string, identity: string) => `${namespace}:ratelimit:${kind}:${crypto.createHash("sha256").update(identity).digest("hex")}`,
	propertyVersion: () => `${namespace}:cache:properties:version`,
	propertySearch: (version: string, canonicalQuery: string) => `${namespace}:cache:properties:${version}:${crypto.createHash("sha256").update(canonicalQuery).digest("hex")}`,
};

type RedisLike = RedisClientType;

export const getRedis = (): RedisLike => redisClient as RedisLike;
