import { ensureRedis, getRedis, redisKeys } from "./redis";
export { redisKeys } from "./redis";

export const PROPERTY_CACHE_TTL_SECONDS = 60;

export const getJsonCache = async <T>(key: string): Promise<T | null> => {
	if (!(await ensureRedis())) return null;
	try {
		const value = await getRedis().get(key);
		if (!value) return null;
		try {
			return JSON.parse(value) as T;
		} catch {
			await getRedis().del(key).catch(() => undefined);
			return null;
		}
	} catch {
		return null;
	}
};

export const setJsonCache = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
	if (!(await ensureRedis())) return;
	try {
		await getRedis().set(key, JSON.stringify(value), { EX: ttlSeconds });
	} catch {
		// Cache is an optimization; PostgreSQL remains authoritative.
	}
};

export const getPropertyCacheVersion = async (): Promise<string> => {
	if (!(await ensureRedis())) return "disabled";
	try {
		const version = await getRedis().get(redisKeys.propertyVersion());
		return version ?? "1";
	} catch {
		return "disabled";
	}
};

export const invalidatePropertyCache = async (): Promise<void> => {
	if (!(await ensureRedis())) return;
	try {
		await getRedis().incr(redisKeys.propertyVersion());
	} catch {
		// Cache invalidation failure cannot change authorization or database truth.
	}
};
