import { useLocation, Link } from "wouter";
import type { ReactNode } from "react";

export type NavItem = {
  label: string;
  icon: ReactNode;
  href: string;
  badge?: number | string;
  testId?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export function SidebarNav({
  sections,
  footer,
}: {
  sections: NavSection[];
  footer?: ReactNode;
}) {
  const [location] = useLocation();
  const matches = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));
  return (
    <aside
      style={{
        width: 240,
        background: "var(--ht-surface-2)",
        borderRight: "1px solid var(--ht-border)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
      }}
    >
      {sections.map((section, sIdx) => (
        <div key={section.title}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--ht-ink-3)",
              textTransform: "uppercase",
              letterSpacing: 1.1,
              padding: sIdx === 0 ? "0 10px 8px" : "16px 10px 8px",
            }}
          >
            {section.title}
          </div>
          {section.items.map((it) => {
            const active = matches(it.href);
            return (
              <Link
                key={it.label}
                href={it.href}
                data-testid={it.testId ?? `nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  background: active ? "var(--ht-tint-navy)" : "transparent",
                  color: active ? "var(--ht-navy)" : "var(--ht-ink-2)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  textDecoration: "none",
                  position: "relative",
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    color: active ? "var(--ht-navy)" : "var(--ht-ink-3)",
                  }}
                >
                  {it.icon}
                </span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badge != null && it.badge !== 0 && it.badge !== "0" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: active ? "var(--ht-navy)" : "var(--ht-border-strong)",
                      color: active ? "white" : "var(--ht-ink)",
                      padding: "2px 7px",
                      borderRadius: 999,
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {it.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      {footer}
    </aside>
  );
}
