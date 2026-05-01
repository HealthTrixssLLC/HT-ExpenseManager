import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, BookOpen, ChevronRight, HelpCircle } from "lucide-react";

import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { RenderHelpBlock, helpProseStyle } from "@/components/help/HelpBlocks";
import {
  HELP_CATEGORIES,
  getCategoryTitle,
  getTopic,
} from "@/lib/help/content";

export default function HelpTopicPage() {
  const [, params] = useRoute<{ id: string }>("/help/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const topic = getTopic(id);

  if (!topic) {
    return (
      <div
        style={{
          padding: "24px 24px 48px",
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <HtCard>
          <HtCardHeader
            title="Help topic not found"
            subtitle={`We couldn't find a help topic with id "${id}".`}
          />
          <Link
            href="/help"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--ht-navy)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={14} /> Back to Help center
          </Link>
        </HtCard>
      </div>
    );
  }

  const category = HELP_CATEGORIES.find((c) => c.id === topic.category);
  const siblings = category?.topicIds.filter((tid) => tid !== topic.id) ?? [];
  const related = (topic.related ?? []).map((rid) => getTopic(rid)).filter(Boolean);

  return (
    <div
      style={{
        padding: "24px 24px 48px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--ht-ink-3)",
          marginBottom: 12,
        }}
      >
        <Link
          href="/help"
          style={{ color: "var(--ht-navy)", textDecoration: "none", fontWeight: 600 }}
          data-testid="help-back-link"
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <BookOpen size={12} /> Help
          </span>
        </Link>
        <ChevronRight size={12} />
        <span>{getCategoryTitle(topic.category)}</span>
        <ChevronRight size={12} />
        <span style={{ color: "var(--ht-ink-2)", fontWeight: 600 }}>{topic.title}</span>
      </nav>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <HtCard>
            <header style={{ marginBottom: 10 }}>
              <h1
                data-testid="help-topic-title"
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--ht-ink)",
                  letterSpacing: -0.3,
                }}
              >
                {topic.title}
              </h1>
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--ht-ink-3)",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {topic.summary}
              </div>
              {(topic.roles?.length || topic.whoCanDo) && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {topic.whoCanDo && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--ht-ink-3)",
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        fontWeight: 700,
                      }}
                    >
                      Who can do this:
                    </span>
                  )}
                  {topic.whoCanDo && (
                    <span style={{ fontSize: 12.5, color: "var(--ht-ink-2)" }}>
                      {topic.whoCanDo}
                    </span>
                  )}
                  {topic.roles?.map((r) => (
                    <span
                      key={r}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--ht-tint-navy)",
                        color: "var(--ht-navy)",
                        border: "1px solid var(--ht-border)",
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </header>
            <div style={helpProseStyle}>
              {topic.blocks.map((b, i) => (
                <RenderHelpBlock key={i} block={b} />
              ))}
            </div>
          </HtCard>

          {related.length > 0 && (
            <HtCard>
              <HtCardHeader title="Related topics" />
              <div style={{ display: "grid", gap: 6 }}>
                {related.map(
                  (rt) =>
                    rt && (
                      <Link
                        key={rt.id}
                        href={`/help/${rt.id}`}
                        data-testid={`help-related-${rt.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--ht-border)",
                          textDecoration: "none",
                          color: "var(--ht-ink)",
                          fontSize: 13.5,
                          background: "var(--ht-surface)",
                        }}
                      >
                        <span>
                          <span style={{ fontWeight: 600 }}>{rt.title}</span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 12,
                              color: "var(--ht-ink-3)",
                              marginTop: 2,
                            }}
                          >
                            {rt.summary}
                          </span>
                        </span>
                        <ChevronRight size={14} color="var(--ht-ink-3)" />
                      </Link>
                    ),
                )}
              </div>
            </HtCard>
          )}
        </div>

        <aside style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <HtCard pad={14}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                fontWeight: 700,
                color: "var(--ht-ink-3)",
                marginBottom: 8,
              }}
            >
              {category?.title ?? "Category"}
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {[topic.id, ...siblings].map((tid) => {
                const t = getTopic(tid);
                if (!t) return null;
                const active = tid === topic.id;
                return (
                  <Link
                    key={tid}
                    href={`/help/${tid}`}
                    data-testid={`help-sibling-${tid}`}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: 13,
                      color: active ? "var(--ht-navy)" : "var(--ht-ink-2)",
                      fontWeight: active ? 700 : 500,
                      background: active ? "var(--ht-tint-navy)" : "transparent",
                    }}
                  >
                    {t.title}
                  </Link>
                );
              })}
            </div>
          </HtCard>
          <button
            type="button"
            onClick={() => navigate("/help")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--ht-navy)",
              background: "var(--ht-surface)",
              border: "1px solid var(--ht-border)",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <HelpCircle size={14} /> Browse all topics
          </button>
        </aside>
      </div>
    </div>
  );
}
