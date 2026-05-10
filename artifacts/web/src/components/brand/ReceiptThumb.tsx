import { useState } from "react";
import { FileText, Image as ImageIcon, FileQuestion, X, ExternalLink } from "lucide-react";
import {
  useGetReceiptDownloadUrl,
  getGetReceiptDownloadUrlQueryKey,
  type Receipt,
} from "@workspace/api-client-react";
import { SILENT_404_META } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const PDF_TYPES = new Set(["application/pdf"]);

function pickIcon(mimeType: string | null | undefined) {
  if (!mimeType) return FileQuestion;
  if (IMAGE_TYPES.has(mimeType)) return ImageIcon;
  if (PDF_TYPES.has(mimeType)) return FileText;
  return FileQuestion;
}

/**
 * Receipt thumbnail. Renders the image preview when the receipt is an image
 * and we successfully fetched a signed download URL; otherwise falls back to
 * a content-type-aware icon. Click to enlarge in a modal (or open the file
 * in a new tab for PDFs/other types).
 */
export function ReceiptThumb({
  receipt,
  size = 56,
  enlargeable = true,
}: {
  receipt: Receipt;
  size?: number;
  enlargeable?: boolean;
}) {
  const isImage = receipt.mimeType ? IMAGE_TYPES.has(receipt.mimeType) : false;
  const isPdf = receipt.mimeType ? PDF_TYPES.has(receipt.mimeType) : false;
  const Icon = pickIcon(receipt.mimeType);
  const [open, setOpen] = useState(false);
  const dl = useGetReceiptDownloadUrl(receipt.id, {
    query: {
      queryKey: getGetReceiptDownloadUrlQueryKey(receipt.id),
      enabled: Boolean(isImage) || open,
      staleTime: 4 * 60_000,
      meta: SILENT_404_META,
    },
  });

  const handleClick = () => {
    if (!enlargeable) return;
    if (isImage) {
      setOpen(true);
    } else if (dl.data?.downloadURL) {
      window.open(dl.data.downloadURL, "_blank", "noopener,noreferrer");
    } else {
      setOpen(true);
    }
  };

  const thumb = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: "var(--ht-tint-navy)",
        color: "var(--ht-navy)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flexShrink: 0,
        border: "1px solid var(--ht-border)",
        cursor: enlargeable ? "zoom-in" : "default",
      }}
      title={receipt.filename ?? receipt.mimeType ?? "Receipt"}
      data-testid={`receipt-thumb-${receipt.id}`}
      onClick={enlargeable ? handleClick : undefined}
      onKeyDown={
        enlargeable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      role={enlargeable ? "button" : undefined}
      tabIndex={enlargeable ? 0 : undefined}
      aria-label={enlargeable ? `Enlarge receipt ${receipt.filename ?? ""}` : undefined}
    >
      {isImage && dl.data?.downloadURL ? (
        <img
          src={dl.data.downloadURL}
          alt={receipt.filename ?? "Receipt"}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Icon size={Math.round(size * 0.4)} strokeWidth={1.8} />
      )}
    </div>
  );

  if (!enlargeable) return thumb;

  return (
    <>
      {thumb}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-3xl p-0 overflow-hidden"
          data-testid={`receipt-enlarge-${receipt.id}`}
        >
          <DialogTitle className="sr-only">
            {receipt.filename ?? "Receipt"}
          </DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <div className="text-sm font-medium truncate">
              {receipt.filename ?? "Receipt"}
            </div>
            <div className="flex items-center gap-2">
              {dl.data?.downloadURL ? (
                <a
                  href={dl.data.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs inline-flex items-center gap-1 text-[var(--ht-navy)] hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </a>
              ) : null}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-[var(--ht-tint-navy)]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="bg-black/90 flex items-center justify-center min-h-[60vh] max-h-[80vh]">
            {isImage && dl.data?.downloadURL ? (
              <img
                src={dl.data.downloadURL}
                alt={receipt.filename ?? "Receipt"}
                style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }}
              />
            ) : isPdf && dl.data?.downloadURL ? (
              <iframe
                src={dl.data.downloadURL}
                title={receipt.filename ?? "Receipt"}
                style={{ width: "100%", height: "80vh", border: 0, background: "white" }}
              />
            ) : (
              <div className="text-white text-sm p-8 text-center">
                {dl.isLoading ? "Loading..." : "Preview not available."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
