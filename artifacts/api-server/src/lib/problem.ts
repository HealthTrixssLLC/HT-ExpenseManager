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
  sendProblem(res, 500, "Internal Server Error");
}
