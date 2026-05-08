import { FileText, Image as ImageIcon, FileQuestion } from "lucide-react";
import {
  useGetReceiptDownloadUrl,
  getGetReceiptDownloadUrlQueryKey,
  type Receipt,
} from "@workspace/api-client-react";
import { SILENT_404_META } from "@/lib/queryClient";

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
 * a content-type-aware icon.
 */
export function ReceiptThumb({
  receipt,
  size = 56,
}: {
  receipt: Receipt;
  size?: number;
}) {
  const isImage = receipt.mimeType ? IMAGE_TYPES.has(receipt.mimeType) : false;
  const Icon = pickIcon(receipt.mimeType);
  const dl = useGetReceiptDownloadUrl(receipt.id, {
    query: {
      queryKey: getGetReceiptDownloadUrlQueryKey(receipt.id),
      enabled: Boolean(isImage),
      staleTime: 4 * 60_000,
      meta: SILENT_404_META,
    },
  });
  return (
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
      }}
      title={receipt.filename ?? receipt.mimeType ?? "Receipt"}
      data-testid={`receipt-thumb-${receipt.id}`}
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
}
