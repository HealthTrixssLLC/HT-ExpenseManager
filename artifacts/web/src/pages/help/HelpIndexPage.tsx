import { useMemo, useState } from "react";
import { Link } from "wouter";
import { BookOpen, ChevronRight, Search } from "lucide-react";

import { HtCard, HtCardHeader } from "@/components/brand/Card";
import {
  HELP_CATEGORIES,
  getTopic,
  searchTopics,
} from "@/lib/help/content";

export default function HelpIndexPage() {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchTopics(q), [q]);

  return (
    <div
      style={{
        padding: "24px 24px 48px",
        maxWidth: 1080,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--ht-tint-navy)",
            color: "var(--ht-navy)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <BookOpen size={20} />
        </div>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "var(--ht-ink)",
              letterSpacing: -0.4,
            }}
          >
            Help center
          </h1>
          <div style={{ fontSize: 13, color: "var(--ht-ink-3)" }}>
            How Healthtrix Expense works — for everyone, top to bottom.
          </div>
        </div>
      </header>

      <HtCard pad={14}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid var(--ht-border)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "var(--ht-surface)",
          }}
        >
          <Search size={16} color="var(--ht-ink-3)" />
          <input
            data-testid="help-search-input"
            type="search"
            placeholder="Search help topics, e.g. 'reject', 'reconcile', 'receipts'…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 14,
              background: "transparent",
              color: "var(--ht-ink)",
            }}
            autoFocus
          />
        </div>
      </HtCard>

      {q.trim() ? (
        <HtCard>
          <HtCardHeader
            title="Search results"
            subtitle={`${results.length} topic${results.length === 1 ? "" : "s"} match "${q}"`}
          />
          {results.length === 0 ? (
            <div
              style={{
                fontSize: 14,
                color: "var(--ht-ink-3)",
                padding: "8px 0",
              }}
            >
              No matches. Try simpler terms.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {results.map((t) => (
                <Link
                  key={t.id}
                  href={`/help/${t.id}`}
                  data-testid={`help-result-${t.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    textDecoration: "none",
                    border: "1px solid var(--ht-border)",
                    background: "var(--ht-surface)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--ht-ink)",
                      }}
                    >
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ht-ink-3)",
                        marginTop: 2,
                      }}
                    >
                      {t.summary}
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--ht-ink-3)" />
                </Link>
              ))}
            </div>
          )}
        </HtCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          {HELP_CATEGORIES.map((cat) => (
            <HtCard key={cat.id}>
              <HtCardHeader title={cat.title} subtitle={cat.description} />
              <div style={{ display: "grid", gap: 4 }}>
                {cat.topicIds.map((tid) => {
                  const topic = getTopic(tid);
                  if (!topic) return null;
                  return (
                    <Link
                      key={tid}
                      href={`/help/${tid}`}
                      data-testid={`help-topic-link-${tid}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: "var(--ht-ink)",
                        fontSize: 13.5,
                      }}
                    >
                      <span>{topic.title}</span>
                      <ChevronRight size={14} color="var(--ht-ink-3)" />
                    </Link>
                  );
                })}
              </div>
            </HtCard>
          ))}
        </div>
      )}
    </div>
  );
}
