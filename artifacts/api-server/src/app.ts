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

const allowedOrigin = process.env["WEB_ORIGIN"];
app.use(
  cors({
    origin: allowedOrigin ? allowedOrigin.split(",") : true,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Healthtrix-Client",
    ],
    exposedHeaders: ["X-Healthtrix-Client"],
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
