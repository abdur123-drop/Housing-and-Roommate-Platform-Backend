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

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Feature routes are mounted here, e.g.
// app.use("/api/v1/auth", AuthRoutes);
// app.use("/api/v1/property", PropertyRoutes);

app.get("/", async (_req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message:
			"Welcome to PH Housing & Roommate Matching Platform Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
