import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { DetailedHealthCheckResponse, HealthCheckResponse } from "@workspace/api-zod";
import { db } from "../lib/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

router.get("/health", async (req, res) => {
  let dbStatus: "connected" | "disconnected" = "connected";
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    req.log.error({ err }, "DB ping failed");
    dbStatus = "disconnected";
  }
  res.json(
    DetailedHealthCheckResponse.parse({
      ok: dbStatus === "connected",
      db: dbStatus,
      version: "0.1.0",
    }),
  );
});

export default router;
