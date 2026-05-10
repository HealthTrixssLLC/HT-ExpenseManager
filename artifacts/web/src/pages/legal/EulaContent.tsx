import {
  EULA_COMPANY,
  EULA_EFFECTIVE_DATE,
  EULA_INTRO,
  EULA_PRODUCT_NAME,
  EULA_SECTIONS,
  EULA_VERSION,
} from "@workspace/legal";

export function EulaContent() {
  return (
    <article
      data-testid="eula-content"
      style={{
        color: "var(--ht-ink)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            color: "var(--ht-ink)",
            letterSpacing: -0.2,
          }}
        >
          {EULA_PRODUCT_NAME} End User Agreement
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: "var(--ht-ink-3)",
          }}
        >
          Version {EULA_VERSION} · Effective {EULA_EFFECTIVE_DATE}
        </p>
      </header>
      <p style={{ marginTop: 0 }}>{EULA_INTRO}</p>
      {EULA_SECTIONS.map((section) => (
        <section key={section.id} style={{ marginTop: 18 }}>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              margin: "0 0 6px",
              color: "var(--ht-ink)",
            }}
          >
            {section.heading}
          </h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 8px" }}>
              {p}
            </p>
          ))}
        </section>
      ))}
      <footer
        style={{
          marginTop: 28,
          paddingTop: 16,
          borderTop: "1px solid var(--ht-border)",
          fontSize: 12,
          color: "var(--ht-ink-3)",
        }}
      >
        © {new Date().getFullYear()} {EULA_COMPANY}. All rights reserved.
      </footer>
    </article>
  );
}
