import type { Response } from "express";

export class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type?: string;

  constructor(
    status: number,
    title: string,
    detail?: string,
    type?: string,
  ) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
  }
}

export function sendProblem(
  res: Response,
  status: number,
  title: string,
  detail?: string,
): void {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title, status, detail });
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    sendProblem(res, err.status, err.title, err.detail);
    return;
  }
  sendProblem(res, 500, "Internal Server Error");
}
