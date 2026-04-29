import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { and, eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { db, receiptsTable } from "../lib/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { sendProblem } from "../lib/problem";
import { requireAuth } from "../middlewares/session";
import { canView, fetchReportOrThrow } from "../lib/reports";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Receipt upload constraints from the spec.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function validateUpload(
  size: number,
  contentType: string,
): { ok: true } | { ok: false; status: number; title: string; detail: string } {
  if (!ALLOWED_MIME.has(contentType.toLowerCase())) {
    return {
      ok: false,
      status: 415,
      title: "Unsupported Media Type",
      detail: `Receipts must be one of: ${[...ALLOWED_MIME].join(", ")}.`,
    };
  }
  if (size > MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      title: "Payload Too Large",
      detail: `Receipts are limited to 10 MB (got ${size} bytes).`,
    };
  }
  return { ok: true };
}

async function handleUploadRequest(req: Request, res: Response): Promise<void> {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const { name, size, contentType } = parsed.data;
  const v = validateUpload(size, contentType);
  if (!v.ok) {
    sendProblem(res, v.status, v.title, v.detail);
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
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
      } else {
        // Manager/finance can view but cannot delete employee receipts.
        allowed = false;
      }
      void canView; // Available for future delete-time policies.
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
      res.status(404).json({ error: "File not found" });
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
    res.status(500).json({ error: "Failed to serve public object" });
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
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;
