/**
 * Public-facing Intuit OAuth callback. This router lives outside the admin
 * router because it is hit by the user's browser arriving from Intuit, not
 * by an authenticated SPA request — so requireAuth would (incorrectly) reject
 * it. Instead we authenticate the request via the one-time `state` value
 * that was created by /admin/qbo-connection/oauth/start (org-scoped + nonce,
 * stored in qbo_oauth_states with a 15 minute TTL).
 *
 * On success we 302 the browser back to /admin/qbo with `?qboStatus=connected`.
 * On failure we 302 with `?qboStatus=error&qboMessage=...` so the QboPage UI
 * can render an inline banner without us having to surface a server-side
 * error page.
 */
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { handleQboOauthCallback } from "../services/qbo";
import {
  QboRedirectConfigError,
  resolveQboRedirectUri,
} from "../services/qboRedirect";

const router: IRouter = Router();

const ADMIN_QBO_PATH = "/admin/qbo";

router.get(
  "/admin/qbo-connection/oauth/callback",
  async (req: Request, res: Response): Promise<void> => {
    const code = (req.query["code"] as string | undefined) ?? "";
    const state = (req.query["state"] as string | undefined) ?? "";
    const realmId = (req.query["realmId"] as string | undefined) ?? "";
    const errorParam = (req.query["error"] as string | undefined) ?? "";
    const errorDescription =
      (req.query["error_description"] as string | undefined) ?? "";

    if (errorParam) {
      // Surface Intuit's underlying error so the admin sees actionable text
      // (e.g. "invalid_client: Client authentication failed") instead of the
      // generic "connection failed" fallback. Include realmId when present
      // so the admin can confirm which company they tried to authorize.
      const parts = [errorParam];
      if (errorDescription) parts.push(errorDescription);
      if (realmId) parts.push(`realmId=${realmId}`);
      const message = parts.join(": ").replace(/^([^:]+): \1: /, "$1: ");
      res.redirect(
        `${ADMIN_QBO_PATH}?qboStatus=error&qboMessage=${encodeURIComponent(message)}`,
      );
      return;
    }
    if (!code || !state || !realmId) {
      res.redirect(
        `${ADMIN_QBO_PATH}?qboStatus=error&qboMessage=${encodeURIComponent(
          "Missing code, state, or realmId in callback",
        )}`,
      );
      return;
    }

    // `state` is an opaque nonce; the org/user binding is resolved
    // server-side from the qbo_oauth_states row.
    let redirectUri: string;
    try {
      redirectUri = resolveQboRedirectUri(req);
    } catch (err) {
      if (err instanceof QboRedirectConfigError) {
        // Should be rare — the start endpoint already gates on this — but
        // guard against config drift between authorize-time and callback-
        // time so the admin sees a friendly banner instead of a 500.
        res.redirect(
          `${ADMIN_QBO_PATH}?qboStatus=error&qboMessage=${encodeURIComponent(err.message)}`,
        );
        return;
      }
      throw err;
    }
    const result = await handleQboOauthCallback({
      state,
      code,
      realmId,
      redirectUri,
    });

    if (!result.ok) {
      res.redirect(
        `${ADMIN_QBO_PATH}?qboStatus=error&qboMessage=${encodeURIComponent(
          result.errorMessage ?? "Unknown error",
        )}`,
      );
      return;
    }
    res.redirect(`${ADMIN_QBO_PATH}?qboStatus=connected`);
  },
);

export default router;
