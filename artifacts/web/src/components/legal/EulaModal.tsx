import { useEffect } from "react";
import { EulaContent } from "@/pages/legal/EulaContent";

export function EulaModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="End User Agreement"
      data-testid="eula-modal"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--ht-surface)",
          borderRadius: 14,
          maxWidth: 720,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 18px 48px rgba(15,23,42,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 16px 0",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="button-close-eula"
            style={{
              background: "transparent",
              border: "1px solid var(--ht-border)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ht-ink-2)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div
          style={{
            overflowY: "auto",
            padding: "8px 28px 28px",
          }}
        >
          <EulaContent />
        </div>
      </div>
    </div>
  );
}
