import type { NextFunction, Request, RequestHandler, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";
import { ensureRedis, getRedis, redisKeys } from "../lib/redis";

type RateLimitOptions = {
	namespace: string;
	limit: number;
	windowSeconds: number;
	keyGenerator: (req: Request) => string;
};

const rateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}
`;

export const redisRateLimit = (options: RateLimitOptions): RequestHandler =>
	async (req: Request, _res: Response, next: NextFunction) => {
		try {
			if (!(await ensureRedis())) {
				throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "Security rate limiting is temporarily unavailable");
			}
			const identity = options.keyGenerator(req).trim();
			const key = redisKeys.rateLimit(options.namespace, identity);
			const result = (await getRedis().eval(rateLimitScript, { keys: [key], arguments: [String(options.windowSeconds)] })) as [number, number];
			const count = Number(result[0]);
			const ttl = Number(result[1]);
			if (count > options.limit) {
				(_res as Response).setHeader("Retry-After", String(Math.max(ttl, 1)));
				throw new AppError(httpStatus.TOO_MANY_REQUESTS, "Too many requests. Please try again later.");
			}
			next();
		} catch (error) {
			next(error);
		}
	};

export const normalizeRateLimitEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();
