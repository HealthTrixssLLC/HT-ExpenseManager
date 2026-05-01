import type { CSSProperties } from "react";
import type { HelpBlock } from "@/lib/help/types";

const calloutStyles: Record<
  NonNullable<Extract<HelpBlock, { type: "callout" }>["tone"]>,
  { bg: string; border: string; ink: string; chip: string }
> = {
  info: {
    bg: "rgba(46,69,107,0.05)",
    border: "rgba(46,69,107,0.2)",
    ink: "var(--ht-ink)",
    chip: "var(--ht-navy)",
  },
  warning: {
    bg: "rgba(178,105,0,0.07)",
    border: "rgba(178,105,0,0.25)",
    ink: "var(--ht-ink)",
    chip: "#B26900",
  },
  tip: {
    bg: "rgba(31,142,90,0.06)",
    border: "rgba(31,142,90,0.25)",
    ink: "var(--ht-ink)",
    chip: "#1F8E5A",
  },
  success: {
    bg: "rgba(31,142,90,0.06)",
    border: "rgba(31,142,90,0.25)",
    ink: "var(--ht-ink)",
    chip: "#1F8E5A",
  },
};

export function RenderHelpBlock({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--ht-ink-2)",
            margin: "0 0 14px",
          }}
        >
          {block.text}
        </p>
      );
    case "h":
      return (
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--ht-ink)",
            margin: "20px 0 8px",
            letterSpacing: -0.1,
          }}
        >
          {block.text}
        </h3>
      );
    case "ol":
      return (
        <ol
          style={{
            paddingLeft: 22,
            margin: "0 0 14px",
            color: "var(--ht-ink-2)",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {block.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {it}
            </li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul
          style={{
            paddingLeft: 22,
            margin: "0 0 14px",
            color: "var(--ht-ink-2)",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {block.items.map((it, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {it}
            </li>
          ))}
        </ul>
      );
    case "callout": {
      const tone = block.tone ?? "info";
      const t = calloutStyles[tone];
      return (
        <div
          style={{
            background: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: "12px 14px",
            margin: "12px 0 16px",
            display: "flex",
            gap: 12,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 4,
              borderRadius: 4,
              background: t.chip,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            {block.title && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: t.chip,
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {block.title}
              </div>
            )}
            <div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.55 }}>
              {block.text}
            </div>
          </div>
        </div>
      );
    }
    case "kv":
      return (
        <div
          style={{
            border: "1px solid var(--ht-border)",
            borderRadius: 10,
            overflow: "hidden",
            margin: "0 0 16px",
            background: "var(--ht-surface)",
          }}
        >
          {block.rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(160px, 240px) 1fr",
                borderTop: i === 0 ? "none" : "1px solid var(--ht-border)",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--ht-surface-2, #FAFAFC)",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--ht-ink)",
                }}
              >
                {row.k}
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--ht-ink-2)",
                  lineHeight: 1.5,
                }}
              >
                {row.v}
              </div>
            </div>
          ))}
        </div>
      );
    case "diagram":
      return <DiagramBlock nodes={block.nodes} edges={block.edges} />;
    default:
      return null;
  }
}

function DiagramBlock({
  nodes,
  edges,
}: {
  nodes: string[];
  edges: { from: string; to: string; label?: string }[];
}) {
  return (
    <div
      style={{
        border: "1px solid var(--ht-border)",
        borderRadius: 12,
        padding: 16,
        background: "var(--ht-surface)",
        margin: "8px 0 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "var(--ht-ink-3)",
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        States
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 16,
        }}
      >
        {nodes.map((n) => (
          <span
            key={n}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--ht-tint-navy)",
              color: "var(--ht-navy)",
              border: "1px solid var(--ht-border)",
            }}
          >
            {n}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "var(--ht-ink-3)",
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        Transitions
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 6,
        }}
      >
        {edges.map((e, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--ht-ink-2)",
              padding: "6px 8px",
              borderRadius: 6,
              background: i % 2 === 0 ? "transparent" : "var(--ht-surface-2, #FAFAFC)",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--ht-ink)" }}>
              {e.from}
            </span>
            <span style={{ color: "var(--ht-ink-3)" }}>→</span>
            <span style={{ fontWeight: 600, color: "var(--ht-ink)" }}>
              {e.to}
            </span>
            {e.label && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ht-ink-3)",
                  marginLeft: "auto",
                  fontStyle: "italic",
                }}
              >
                {e.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const helpProseStyle: CSSProperties = {
  maxWidth: 760,
};
