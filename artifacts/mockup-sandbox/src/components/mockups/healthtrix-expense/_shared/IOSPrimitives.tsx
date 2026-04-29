import React from "react";
import { ChevronLeft } from "lucide-react";

export function IOSNavigationBar({
  title,
  largeTitle = false,
  leading,
  trailing,
  backText,
  onBack,
  background = "rgba(242, 242, 247, 0.8)",
  border = true,
}: {
  title: string;
  largeTitle?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  backText?: string;
  onBack?: () => void;
  background?: string;
  border?: boolean;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: border ? "1px solid var(--ht-border)" : "none",
        paddingBottom: largeTitle ? 8 : 12,
        paddingTop: 12,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          {onBack ? (
            <button
              onClick={onBack}
              style={{
                display: "flex",
                alignItems: "center",
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                color: "var(--ht-navy)",
                fontSize: 17,
                fontWeight: 400,
                marginLeft: -8,
              }}
            >
              <ChevronLeft size={28} strokeWidth={1.5} />
              {backText && <span style={{ marginLeft: -4 }}>{backText}</span>}
            </button>
          ) : (
            leading
          )}
        </div>
        {!largeTitle && (
          <div style={{ flex: 2, textAlign: "center", fontSize: 17, fontWeight: 600 }}>
            {title}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          {trailing}
        </div>
      </div>
      {largeTitle && (
        <div style={{ marginTop: 8 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: 0.4 }}>{title}</h1>
        </div>
      )}
    </div>
  );
}

export function IOSList({ children, header, footer }: { children: React.ReactNode; header?: string; footer?: string }) {
  return (
    <div style={{ margin: "24px 16px" }}>
      {header && (
        <div style={{ fontSize: 13, textTransform: "uppercase", color: "var(--ht-ink-3)", marginLeft: 16, marginBottom: 8 }}>
          {header}
        </div>
      )}
      <div style={{ background: "var(--ht-surface)", borderRadius: 10, overflow: "hidden" }}>
        {children}
      </div>
      {footer && (
        <div style={{ fontSize: 13, color: "var(--ht-ink-3)", marginLeft: 16, marginTop: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function IOSListItem({
  children,
  leading,
  trailing,
  isLast = false,
  onClick,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  isLast?: boolean;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        paddingLeft: leading ? 16 : 16,
        background: "transparent",
        border: "none",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        color: "inherit",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {leading && <div style={{ marginRight: 16 }}>{leading}</div>}
      <div
        style={{
          flex: 1,
          borderBottom: isLast ? "none" : "1px solid var(--ht-border)",
          paddingBottom: 12,
          marginBottom: -12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 400 }}>{children}</div>
        {trailing && <div style={{ color: "var(--ht-ink-3)", fontSize: 17 }}>{trailing}</div>}
      </div>
    </Component>
  );
}

export function IOSButton({
  children,
  variant = "primary",
  onClick,
  style,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const getStyles = () => {
    switch (variant) {
      case "primary":
        return { background: "var(--ht-navy)", color: "white" };
      case "secondary":
        return { background: "var(--ht-tint-navy)", color: "var(--ht-navy)" };
      case "danger":
        return { background: "var(--ht-danger)", color: "white" };
      case "tertiary":
        return { background: "transparent", color: "var(--ht-navy)" };
    }
  };

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        height: 50,
        borderRadius: 14,
        fontSize: 17,
        fontWeight: 600,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        cursor: "pointer",
        ...getStyles(),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
