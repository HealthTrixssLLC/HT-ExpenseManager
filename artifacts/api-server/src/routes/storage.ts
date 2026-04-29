import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  GetReceiptDownloadUrlResponse as ReceiptDownloadUrlResponse,
} from "@workspace/api-zod";
import { db, receiptsTable } from "../lib/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { sendProblem } from "../lib/problem";
import { requireAuth } from "../middlewares/session";
import { canView, fetchReportOrThrow } from "../lib/reports";
import { validateReceiptUpload } from "../lib/receipts";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function handleUploadRequest(req: Request, res: Response): Promise<void> {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const { reportId, size, contentType } = parsed.data;
  // Boundary check on the *claimed* size+type so a malicious client cannot ask
  // the storage backend for a signed URL pointing at a 5 GB .exe key. The
  // authoritative re-check happens at receipt registration via
  // `verifyReceiptUpload`, after the upload has actually landed.
  const v = validateReceiptUpload(size, contentType);
  if (!v.ok) {
    sendProblem(res, v.status, v.title, v.detail);
    return;
  }
  // Confirm the report exists, lives in the caller's org, and the caller can
  // view it — we don't want to scope object keys to a report the caller
  // cannot even see.
  let report;
  try {
    report = await fetchReportOrThrow(reportId, req.auth!.user.orgId);
  } catch {
    sendProblem(res, 404, "Not Found", "Report not found in this organization.");
    return;
  }
  if (!(await canView(report, req.auth!.user))) {
    sendProblem(res, 403, "Forbidden", "You cannot attach receipts to this report.");
    return;
  }

  try {
    const receiptId = randomUUID();
    const { uploadURL, objectPath, expiresAt } =
      await objectStorageService.getReceiptUploadURL({
        orgId: req.auth!.user.orgId,
        reportId,
        receiptId,
        ext: v.ext,
      });
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        receiptId,
        expiresAt: expiresAt.toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    sendProblem(res, 500, "Storage Error", "Failed to generate upload URL");
  }
}

// Spec-canonical endpoint. The legacy storage path remains as a thin alias.
router.post("/receipts/upload-url", requireAuth, handleUploadRequest);
router.post("/storage/uploads/request-url", requireAuth, handleUploadRequest);

// Time-limited signed GET URL for an existing receipt. Caller must be able to
// view the parent report; the route itself does the authorization check, then
// asks the storage layer to mint a signed URL.
router.get(
  "/receipts/:id/download-url",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>)["id"];
    const rows = await db
      .select()
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.id, id),
          eq(receiptsTable.orgId, req.auth!.user.orgId),
        ),
      )
      .limit(1);
    const receipt = rows[0];
    if (!receipt) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    if (receipt.reportId) {
      const report = await fetchReportOrThrow(
        receipt.reportId,
        req.auth!.user.orgId,
      );
      if (!(await canView(report, req.auth!.user))) {
        sendProblem(res, 403, "Forbidden");
        return;
      }
    } else if (receipt.uploadedById !== req.auth!.user.id) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    try {
      const { downloadURL, expiresAt } =
        await objectStorageService.getSignedDownloadURL(receipt.objectPath);
      res.json(
        ReceiptDownloadUrlResponse.parse({
          downloadURL,
          expiresAt: expiresAt.toISOString(),
        }),
      );
    } catch (error) {
      req.log.error({ err: error, receiptId: id }, "Error signing download URL");
      sendProblem(res, 500, "Storage Error", "Failed to generate download URL");
    }
  },
);

// Delete a receipt by id. Only the uploader, the report's employee, or an
// org-wide admin/finance role can delete.
router.delete(
  "/receipts/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>)["id"];
    const rows = await db
      .select()
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.id, id),
          eq(receiptsTable.orgId, req.auth!.user.orgId),
        ),
      )
      .limit(1);
    const receipt = rows[0];
    if (!receipt) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    let allowed = receipt.uploadedById === req.auth!.user.id;
    if (!allowed && receipt.reportId) {
      const report = await fetchReportOrThrow(
        receipt.reportId,
        req.auth!.user.orgId,
      );
      if (req.auth!.user.id === report.employeeId) {
        allowed = true;
      } else if (
        req.auth!.user.role === "System Admin" ||
        req.auth!.user.role === "Accounting Admin"
      ) {
        allowed = true;
      }
    }
    if (!allowed) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    await db.delete(receiptsTable).where(eq(receiptsTable.id, id));
    res.status(204).end();
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Public assets (org logos, etc.). No auth.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      sendProblem(res, 404, "Not Found", "Public object not found.");
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    sendProblem(res, 500, "Internal Server Error", "Failed to serve public object.");
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private receipts. The caller must be authenticated and the object
 * must be referenced by a receipt row whose parent report the caller can
 * view (own report, manager of the owner, finance/admin).
 */
router.get(
  "/storage/objects/*path",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const receiptRows = await db
        .select()
        .from(receiptsTable)
        .where(eq(receiptsTable.objectPath, objectPath))
        .limit(1);
      const receipt = receiptRows[0];
      if (!receipt) {
        sendProblem(res, 404, "Not Found");
        return;
      }
      if (!receipt.reportId) {
        if (receipt.uploadedById !== req.auth!.user.id) {
          sendProblem(res, 403, "Forbidden");
          return;
        }
      } else {
        const report = await fetchReportOrThrow(
          receipt.reportId,
          req.auth!.user.orgId,
        );
        if (!(await canView(report, req.auth!.user))) {
          sendProblem(res, 403, "Forbidden");
          return;
        }
      }

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found");
        sendProblem(res, 404, "Not Found", "Object not found.");
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      sendProblem(res, 500, "Internal Server Error", "Failed to serve object.");
    }
  },
);

export default router;
