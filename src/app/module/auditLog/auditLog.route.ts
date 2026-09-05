import { Router } from "express";
import { AppRole } from "../../constants/roles";
import { auth } from "../../middleware/checkAuth";
import { AuditLogController } from "./auditLog.controller";

const router = Router();

router.get(
	"/audit-logs",
	auth(AppRole.ADMIN),
	AuditLogController.listAuditLogs,
);

export const AuditLogRoutes = router;
