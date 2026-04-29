import type { Response } from "express";

export class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly code: string;
  readonly detail?: string;
  readonly type?: string;

  constructor(
    status: number,
    title: string,
    detail?: string,
    code?: string,
    type?: string,
  ) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.code = code ?? deriveCode(status, title);
    this.type = type;
  }
}

function deriveCode(status: number, title: string): string {
  // Stable machine-readable error code: snake_case derived from title.
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `http_${status}`;
}

export function sendProblem(
  res: Response,
  status: number,
  title: string,
  detail?: string,
  code?: string,
): void {
  res
    .status(status)
    .type("application/problem+json")
    .json({
      type: "about:blank",
      title,
      status,
      code: code ?? deriveCode(status, title),
      detail,
    });
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    sendProblem(res, err.status, err.title, err.detail, err.code);
    return;
  }
  // Normalise raw Postgres constraint errors into deterministic
  // problem+json responses so admin/auth flows that hit a unique or
  // foreign-key violation never leak as a generic 500. Postgres SQLSTATE
  // codes: 23505 unique_violation, 23503 foreign_key_violation,
  // 23502 not_null_violation, 23514 check_violation.
  const pg = err as { code?: unknown; detail?: unknown; constraint?: unknown };
  if (pg && typeof pg.code === "string") {
    if (pg.code === "23505") {
      sendProblem(
        res,
        409,
        "Conflict",
        typeof pg.detail === "string" ? pg.detail : "Resource already exists.",
        "unique_violation",
      );
      return;
    }
    if (pg.code === "23503") {
      sendProblem(
        res,
        400,
        "Invalid Reference",
        typeof pg.detail === "string"
          ? pg.detail
          : "Referenced row does not exist.",
        "foreign_key_violation",
      );
      return;
    }
    if (pg.code === "23502" || pg.code === "23514") {
      sendProblem(
        res,
        400,
        "Invalid Body",
        typeof pg.detail === "string" ? pg.detail : "Constraint violation.",
        pg.code === "23502" ? "not_null_violation" : "check_violation",
      );
      return;
    }
  }
  sendProblem(res, 500, "Internal Server Error");
}
