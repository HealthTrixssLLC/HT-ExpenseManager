const EFFECTIVE_DATE = "May 1, 2026";
const VERSION = "0.1-draft";
const COMPANY = "Healthtrix";
const PRODUCT_NAME = "Healthtrix Expense";

const SECTIONS: { id: string; heading: string; paragraphs: string[] }[] = [
  {
    id: "intro",
    heading: "Overview",
    paragraphs: [
      `This Privacy Policy describes how ${COMPANY} ("we", "us") handles personal information collected through ${PRODUCT_NAME} (the "Service"). This is a draft placeholder and is not yet legally reviewed.`,
    ],
  },
  {
    id: "data-collected",
    heading: "Data we collect",
    paragraphs: [
      "Account information you provide when an administrator creates your account or you sign in, including your name, work email address, and assigned roles.",
      "Expense report content you submit, including line items, amounts, vendors, dates, GL coding, attached receipts, and any notes.",
      "Operational metadata generated as you use the Service, such as approval history, audit log entries, sign-in timestamps, and IP address used for the request.",
    ],
  },
  {
    id: "use",
    heading: "How we use it",
    paragraphs: [
      "To operate the expense workflow: routing reports for manager and finance review, posting to QuickBooks, generating payroll batches, and reconciling reimbursements.",
      "To maintain an audit trail required for internal controls and external audits.",
      "To secure the Service, prevent abuse, and troubleshoot issues reported by your administrators.",
    ],
  },
  {
    id: "sharing",
    heading: "Sharing",
    paragraphs: [
      "We share your data only with people inside your organization who have a role that needs access (for example, your manager, finance reviewers, and system administrators).",
      "Limited data is sent to integrated systems that your administrator has connected, such as QuickBooks for GL posting and your payroll provider for reimbursement.",
      "We do not sell personal information.",
    ],
  },
  {
    id: "retention",
    heading: "Retention",
    paragraphs: [
      "Expense reports, receipts, and audit log entries are retained for as long as your organization keeps its account, plus any additional period required by applicable tax, accounting, or audit rules.",
      "Account records are retained while your user is active and for a reasonable period after deactivation to preserve the audit trail of past approvals.",
    ],
  },
  {
    id: "rights",
    heading: "Your choices",
    paragraphs: [
      "Most data in the Service belongs to your employer. Requests to access, correct, or delete personal information should be directed to your organization's system administrator, who can act on your behalf.",
    ],
  },
  {
    id: "contact",
    heading: "Contact",
    paragraphs: [
      `Questions about this draft policy can be sent to your ${COMPANY} system administrator, who will route them to the ${COMPANY} team.`,
    ],
  },
];

export function PrivacyContent() {
  return (
    <article
      data-testid="privacy-content"
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
          {PRODUCT_NAME} Privacy Policy
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: "var(--ht-ink-3)",
          }}
        >
          Version {VERSION} · Effective {EFFECTIVE_DATE}
        </p>
        <div
          style={{
            display: "inline-block",
            marginTop: 10,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            color: "var(--ht-orange)",
            background: "var(--ht-tint-orange)",
            padding: "3px 8px",
            borderRadius: 6,
          }}
        >
          Draft — placeholder copy
        </div>
      </header>
      {SECTIONS.map((section) => (
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
        © {new Date().getFullYear()} {COMPANY}. All rights reserved.
      </footer>
    </article>
  );
}
