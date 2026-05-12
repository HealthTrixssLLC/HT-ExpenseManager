import app from "./app";
import { logger } from "./lib/logger";
import { runTokenRefreshSweep } from "./services/qbo";
import { logMicrosoftAuthStartup } from "./lib/microsoftAuth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  logMicrosoftAuthStartup();

  // Background QBO token-refresh sweep. Runs every 15 minutes and refreshes
  // any org whose Intuit access token is within an hour of expiring. Skipped
  // during automated tests so each test fixture starts in a known state.
  if (process.env["NODE_ENV"] !== "test") {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const tick = (): void => {
      runTokenRefreshSweep()
        .then((result) => {
          if (result.checked > 0) {
            logger.info(
              { ...result },
              "QBO token refresh sweep complete",
            );
          }
        })
        .catch((sweepErr) => {
          logger.warn({ err: sweepErr }, "QBO token refresh sweep failed");
        });
    };
    // Initial run on a small delay so we don't fight the boot path.
    setTimeout(tick, 30_000).unref();
    setInterval(tick, FIFTEEN_MINUTES_MS).unref();
  }
});
