import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport,
  getGetReportQueryKey,
  useListReceipts,
  getListReceiptsQueryKey,
  useRequestUploadUrl,
  useRegisterReceipt,
  useListLineItems,
  getListLineItemsQueryKey,
  useAttachReceiptToLine,
  useDeleteReceipt,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
import { Button } from "@/components/ui/button";
import { UploadCloud, Check, Paperclip, X, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatDate } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function ReceiptsPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: report } = useGetReport(id, {
    query: { queryKey: getGetReportQueryKey(id), enabled: !!id }
  });

  const { data: receipts = [] } = useListReceipts(id, {
    query: { queryKey: getListReceiptsQueryKey(id), enabled: !!id }
  });

  const { data: lineItems = [] } = useListLineItems(id, {
    query: { queryKey: getListLineItemsQueryKey(id), enabled: !!id }
  });

  const requestUploadUrl = useRequestUploadUrl();
  const registerReceipt = useRegisterReceipt();
  const attachToLine = useAttachReceiptToLine();
  const deleteReceipt = useDeleteReceipt();

  const isEditable = report?.status === "Draft" || report?.status === "Changes Requested";

  const uploadOne = useCallback(
    async (file: File) => {
      if (!ACCEPT.includes(file.type)) {
        throw new Error(`Unsupported file type: ${file.type || "unknown"}.`);
      }
      if (file.size > MAX_BYTES) {
        throw new Error(`${file.name} exceeds the 10MB limit.`);
      }
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: {
          reportId: id,
          contentType: file.type,
          name: file.name,
          size: file.size,
        }
      });
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage.");
      }
      await registerReceipt.mutateAsync({
        id,
        data: {
          objectPath,
          mimeType: file.type,
          filename: file.name,
          sizeBytes: file.size,
        }
      });
    },
    [id, requestUploadUrl, registerReceipt]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!isEditable || files.length === 0) return;
      setIsUploading(true);
      setUploadError(null);
      setProgress({ done: 0, total: files.length });
      let ok = 0;
      let firstError: string | null = null;
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadOne(files[i]);
          ok += 1;
        } catch (err) {
          if (!firstError) firstError = err instanceof Error ? err.message : "Upload failed.";
        } finally {
          setProgress({ done: i + 1, total: files.length });
        }
      }
      setIsUploading(false);
      setProgress(null);
      // Refresh the receipts list, plus anything that displays receipt
      // counts / "missing receipts" derived from it: the report header
      // (audit fields, missingReceiptCount), the line items table (each
      // row reports its own attached state), and the report listings
      // (queue rows surface a missing-receipt indicator).
      qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
      // Queue / My Reports rows surface a missing-receipt indicator that
      // depends on receipt presence; refresh the listings too.
      qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (ok > 0) {
        notifySuccess(
          ok === files.length ? "Receipt uploaded" : "Partial upload",
          `${ok} of ${files.length} file${files.length === 1 ? "" : "s"} uploaded.`
        );
      }
      if (firstError) setUploadError(firstError);
    },
    [isEditable, uploadOne, qc, id]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void uploadFiles(files);
  };

  // Drag & drop on the upload card
  const onDragOver = (e: React.DragEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isEditable) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void uploadFiles(files);
  };

  // Paste-from-clipboard anywhere on the page
  useEffect(() => {
    if (!isEditable) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.files ?? []);
      if (items.length > 0) {
        e.preventDefault();
        void uploadFiles(items);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isEditable, uploadFiles]);

  const handleDelete = (receiptId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    deleteReceipt.mutate({ id: receiptId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
        notifySuccess("Receipt deleted", filename);
      },
      // Errors are surfaced globally by queryClient's mutationCache.onError
      // (descriptive toast for 403 / 404 / 5xx). We also force a refresh of
      // the receipts list so a stale row that was already gone server-side
      // disappears from the UI rather than leaving a dead delete button.
      onError: () => {
        qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
      },
    });
  };

  const handleAttach = (receiptId: string, lineItemId: string) => {
    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) return;
    // The server identifies the existing receipt by `objectPath` (the
    // canonical /objects/org/.../receipts/<id>.<ext> key) and updates its
    // `lineItemId` rather than inserting a duplicate row. We still pass
    // filename/mimeType/sizeBytes because the typed RegisterReceiptBody
    // contract requires them, but the server ignores those fields when an
    // existing row is found.
    attachToLine.mutate({
      lineId: lineItemId,
      data: {
        objectPath: receipt.objectPath,
        filename: receipt.filename,
        mimeType: receipt.mimeType,
        sizeBytes: receipt.sizeBytes,
        lineItemId,
      }
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
        notifySuccess("Receipt attached");
      }
    });
  };

  // Group receipts by line item to display "multiple per line" association
  const receiptsByLine = new Map<string, typeof receipts>();
  const orphans: typeof receipts = [];
  for (const r of receipts) {
    if (r.lineItemId) {
      const arr = receiptsByLine.get(r.lineItemId) ?? [];
      arr.push(r);
      receiptsByLine.set(r.lineItemId, arr);
    } else {
      orphans.push(r);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-receipts">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Receipts
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Upload and attach receipts to your expense report.
          </p>
        </div>
        <Link href={`/reports/${id}`}>
          <Button variant="outline">Back to Report</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Unattached receipts */}
          <HtCard style={{ padding: "1.5rem" }}>
            <h3 className="font-medium text-[var(--ht-ink)] mb-3">Unattached receipts</h3>
            {orphans.length === 0 ? (
              <div className="py-6 flex flex-col items-center justify-center text-[var(--ht-ink-3)]">
                <Paperclip className="w-10 h-10 mb-3 text-[var(--ht-ink-4)]" />
                <p className="text-sm">All receipts have been attached.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {orphans.map((receipt) => (
                  <div key={receipt.id} className="space-y-2">
                    <div className="relative group">
                      <ReceiptThumb receipt={receipt} size={192} />
                      {isEditable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(receipt.id, receipt.filename)}
                          disabled={deleteReceipt.isPending}
                          aria-label={`Delete ${receipt.filename}`}
                          data-testid={`button-delete-receipt-${receipt.id}`}
                          className="absolute top-1 right-1 h-7 w-7 bg-white/90 hover:bg-red-50 text-red-600 hover:text-red-700 border border-[var(--ht-border)] shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {isEditable && (
                      <div className="px-1">
                        <Select onValueChange={(val) => handleAttach(receipt.id, val)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Attach to line item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {lineItems.map((item) => (
                              <SelectItem key={item.id} value={item.id} className="text-xs">
                                {formatDate(item.occurredOn)} – {item.merchant} ({formatMoney(Number(item.amount))})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </HtCard>

          {/* Per-line attached receipts */}
          {lineItems.length > 0 && (
            <HtCard style={{ padding: "1.5rem" }}>
              <h3 className="font-medium text-[var(--ht-ink)] mb-3">Attached by line item</h3>
              <div className="space-y-4">
                {lineItems.map((item) => {
                  const attached = receiptsByLine.get(item.id) ?? [];
                  return (
                    <div key={item.id} className="border border-[var(--ht-border)] rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm">
                          <span className="font-medium">{item.merchant}</span>
                          <span className="text-[var(--ht-ink-3)] ml-2">{formatDate(item.occurredOn)}</span>
                        </div>
                        <div className="text-sm font-medium">{formatMoney(Number(item.amount))}</div>
                      </div>
                      {attached.length === 0 ? (
                        <div className="text-xs text-[var(--ht-ink-3)]">No receipts attached.</div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {attached.map((r) => (
                            <div key={r.id} className="relative">
                              <ReceiptThumb receipt={r} size={96} />
                              <div className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-0.5">
                                <Check className="w-3 h-3" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {isEditable && orphans.length > 0 && (
                        <div className="mt-2">
                          <Select onValueChange={(val) => handleAttach(val, item.id)}>
                            <SelectTrigger className="h-7 text-xs w-64">
                              <SelectValue placeholder="Attach another receipt…" />
                            </SelectTrigger>
                            <SelectContent>
                              {orphans.map((r) => (
                                <SelectItem key={r.id} value={r.id} className="text-xs">
                                  {r.filename}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </HtCard>
          )}
        </div>

        <div>
          <HtCard pad={24}>
            <h3 className="font-medium text-[var(--ht-ink)] mb-4">Upload Receipts</h3>

            <div
              ref={dropRef}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                !isEditable
                  ? "border-gray-200 bg-gray-100 opacity-70 cursor-not-allowed"
                  : isDragging
                  ? "border-[var(--ht-primary)] bg-blue-50 cursor-copy"
                  : "border-[var(--ht-border)] hover:border-[var(--ht-primary)] cursor-pointer bg-gray-50"
              }`}
              onClick={() => isEditable && fileInputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              data-testid="receipt-dropzone"
            >
              <UploadCloud className={`w-8 h-8 mx-auto mb-3 ${isEditable ? "text-[var(--ht-primary)]" : "text-gray-400"}`} />
              <p className="text-sm font-medium text-[var(--ht-ink)]">
                {isUploading
                  ? progress
                    ? `Uploading ${progress.done}/${progress.total}…`
                    : "Uploading…"
                  : isDragging
                  ? "Drop to upload"
                  : "Drop, paste, or click to browse"}
              </p>
              <p className="text-xs text-[var(--ht-ink-3)] mt-1">
                JPG, PNG, WEBP, or PDF up to 10MB
              </p>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                disabled={!isEditable || isUploading}
              />
            </div>

            {uploadError && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md p-2">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {!isEditable && (
              <p className="mt-3 text-xs text-[var(--ht-ink-3)] text-center">
                This report can no longer be edited.
              </p>
            )}

            {isEditable && (
              <p className="mt-4 text-xs text-[var(--ht-ink-3)]">
                Tip: paste a screenshot anywhere on this page (⌘/Ctrl+V) to upload it instantly.
              </p>
            )}
          </HtCard>
        </div>
      </div>
    </div>
  );
}
