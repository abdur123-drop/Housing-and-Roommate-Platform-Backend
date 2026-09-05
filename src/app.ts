import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { BuildingRoutes } from "./app/module/building/building.route";
import { AuthorizationTestRoutes } from "./app/module/internal/authorization-test.route";
import { PropertyRoutes } from "./app/module/property/property.route";
import { RoomRoutes } from "./app/module/room/room.route";
import { RoomAvailabilityRoutes } from "./app/module/roomAvailability/roomAvailability.route";
import { UnitRoutes } from "./app/module/unit/unit.route";

const app: Application = express();

// `trust proxy` makes req.ip the real client address behind a load balancer,
// so refresh tokens record a meaningful origin instead of the proxy's IP.
app.set("trust proxy", 1);

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/properties", PropertyRoutes);
app.use("/api/v1", BuildingRoutes);
app.use("/api/v1", UnitRoutes);
app.use("/api/v1", RoomRoutes);
app.use("/api/v1", RoomAvailabilityRoutes);
if (config.node_env === "test") {
	app.use("/api/v1/__authz", AuthorizationTestRoutes);
}
// Further feature routes are mounted here, e.g.
// app.use("/api/v1/property", PropertyRoutes);

app.get("/", async (_req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Housing & Roommate Matching Platform Backend",
	});
});

// notFound must precede the error handler: Express only reaches a 4-arg error
// middleware via next(err), so registering it first meant unmatched routes fell
// through it and never produced a 404.
app.use(notFound);
app.use(globalErrorHandler);

export default app;
