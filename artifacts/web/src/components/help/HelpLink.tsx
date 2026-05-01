import { HelpCircle } from "lucide-react";
import { Link } from "wouter";

/**
 * A small contextual "Help" link to embed at the top of a screen.
 * Links to /help/:topicId.
 */
export function HelpLink({
  topicId,
  label = "Help",
}: {
  topicId: string;
  label?: string;
}) {
  return (
    <Link
      href={`/help/${topicId}`}
      data-testid={`help-link-${topicId}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--ht-navy)",
        textDecoration: "none",
        padding: "4px 8px",
        borderRadius: 6,
        border: "1px solid var(--ht-border)",
        background: "var(--ht-surface)",
        lineHeight: 1.2,
      }}
    >
      <HelpCircle size={13} />
      {label}
    </Link>
  );
}
