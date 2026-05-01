import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachSession, csrfGuard } from "./middlewares/session";
import { sendError, HttpError } from "./lib/problem";

const app: Express = express();

app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: only the explicitly configured WEB_ORIGIN(s) are allowed for
// cross-origin browser sessions, since cookies + CSRF require credentials.
// Same-origin requests (the workspace proxy, Expo bearer-token clients,
// curl-style integration tests) bypass the CORS check entirely.
const rawOrigin = process.env["WEB_ORIGIN"]?.trim();
const allowedOrigins = rawOrigin
  ? rawOrigin
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  : [];
if (allowedOrigins.length === 0) {
  logger.warn(
    "WEB_ORIGIN is not set; cross-origin browser requests will be rejected. " +
      "Set WEB_ORIGIN to the SPA origin (e.g. https://app.example.com) when " +
      "deploying.",
  );
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / non-browser requests (e.g. mobile, curl) have no Origin.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Healthtrix-Client",
    ],
    exposedHeaders: [
      "X-Healthtrix-Client",
      "X-New-Session-Token",
      "X-Backup-Schema-Version",
      "X-Backup-App-Version",
      "X-Backup-Org-Id",
      "X-Backup-Includes-Receipt-Files",
      "X-Backup-Receipt-Warnings",
      "Content-Disposition",
    ],
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Attach session (if any) before CSRF, then enforce CSRF on mutations.
app.use(attachSession);
app.use(csrfGuard);

app.use("/api", router);

// Final error handler — converts thrown HttpErrors into problem+json.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    sendError(res, err);
    return;
  }
  req.log.error({ err }, "Unhandled error");
  sendError(res, err);
});

export default app;
