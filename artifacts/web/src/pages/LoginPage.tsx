import { useEffect, useState, type FormEvent } from "react";
import {
  useGetBootstrapStatus,
  getGetBootstrapStatusQueryKey,
} from "@workspace/api-client-react";
import { HealthtrixMark } from "@/components/brand/BrandHeader";
import { useAuth } from "@/lib/auth";
import { describeApiError } from "@/lib/api";

export function LoginPage() {
  const { login, bootstrap, loginPending, bootstrapPending } = useAuth();
  const bootstrapStatus = useGetBootstrapStatus({
    query: {
      queryKey: getGetBootstrapStatusQueryKey(),
      staleTime: 5 * 60_000,
    },
  });

  const needsBootstrap = bootstrapStatus.data?.bootstrapped === false;
  const [mode, setMode] = useState<"login" | "bootstrap">("login");

  // Auto-switch to bootstrap when the API tells us no admin exists yet.
  useEffect(() => {
    if (needsBootstrap) setMode("bootstrap");
    else setMode("login");
  }, [needsBootstrap]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login({ email: email.trim(), password });
    } catch (caught) {
      const d = describeApiError(caught);
      setErr(d.detail);
    }
  }

  async function onBootstrap(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await bootstrap({
        orgName: orgName.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
    } catch (caught) {
      const d = describeApiError(caught);
      setErr(d.detail);
    }
  }

  const busy = loginPending || bootstrapPending;
  const isLoading = bootstrapStatus.isLoading;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 480px)",
        background: "var(--ht-canvas)",
      }}
    >
      <aside
        style={{
          background:
            "linear-gradient(135deg, var(--ht-navy) 0%, #1d2e49 60%, #14233B 100%)",
          color: "white",
          padding: "48px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <HealthtrixMark size={48} variant="dark" />
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 460 }}>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: -0.5,
            }}
          >
            Expense reports that survive the audit.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.78)",
              marginTop: 16,
              lineHeight: 1.55,
            }}
          >
            Submit, review, post to QuickBooks, reimburse through payroll, and
            reconcile — every stage in one auditable workflow.
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "24px 0 0",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {[
              "Receipt-backed line items with policy guidance",
              "Manager and finance approval queues",
              "QuickBooks GL posting + payroll reconciliation",
            ].map((line) => (
              <li
                key={line}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--ht-orange)",
                    flexShrink: 0,
                  }}
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 0.4,
          }}
        >
          © Healthtrix · Internal expense workflow
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 360,
            height: 360,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(254,160,2,0.18) 0%, rgba(254,160,2,0) 70%)",
          }}
        />
      </aside>

      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 32px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          {isLoading ? (
            <div style={{ color: "var(--ht-ink-3)", fontSize: 13 }}>Loading…</div>
          ) : mode === "bootstrap" ? (
            <BootstrapForm
              email={email}
              password={password}
              orgName={orgName}
              fullName={fullName}
              setEmail={setEmail}
              setPassword={setPassword}
              setOrgName={setOrgName}
              setFullName={setFullName}
              onSubmit={onBootstrap}
              busy={busy}
              err={err}
            />
          ) : (
            <LoginForm
              email={email}
              password={password}
              setEmail={setEmail}
              setPassword={setPassword}
              onSubmit={onLogin}
              busy={busy}
              err={err}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function LoginForm(props: {
  email: string;
  password: string;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  err: string | null;
}) {
  return (
    <form onSubmit={props.onSubmit}>
      <div style={{ marginBottom: 28 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            color: "var(--ht-ink)",
            letterSpacing: -0.2,
          }}
        >
          Sign in
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--ht-ink-3)",
            margin: "6px 0 0",
          }}
        >
          Use your Healthtrix work email.
        </p>
      </div>
      <Field label="Email">
        <input
          type="email"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          data-testid="input-email"
          style={inputStyle}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          required
          autoComplete="current-password"
          data-testid="input-password"
          style={inputStyle}
        />
      </Field>
      {props.err && <ErrorBanner message={props.err} />}
      <button
        type="submit"
        disabled={props.busy}
        data-testid="button-login"
        style={primaryButtonStyle(props.busy)}
      >
        {props.busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function BootstrapForm(props: {
  email: string;
  password: string;
  orgName: string;
  fullName: string;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  setOrgName: (s: string) => void;
  setFullName: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  err: string | null;
}) {
  return (
    <form onSubmit={props.onSubmit}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            color: "var(--ht-orange)",
            background: "var(--ht-tint-orange)",
            padding: "3px 8px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          First-time setup
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            color: "var(--ht-ink)",
            letterSpacing: -0.2,
          }}
        >
          Create the System Admin
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--ht-ink-3)",
            margin: "6px 0 0",
          }}
        >
          One-time bootstrap. After this you can invite the rest of the team.
        </p>
      </div>
      <Field label="Organization name">
        <input
          type="text"
          value={props.orgName}
          onChange={(e) => props.setOrgName(e.target.value)}
          required
          data-testid="input-org-name"
          style={inputStyle}
        />
      </Field>
      <Field label="Your full name">
        <input
          type="text"
          value={props.fullName}
          onChange={(e) => props.setFullName(e.target.value)}
          required
          data-testid="input-full-name"
          style={inputStyle}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          required
          autoComplete="email"
          data-testid="input-email"
          style={inputStyle}
        />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <input
          type="password"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          data-testid="input-password"
          style={inputStyle}
        />
      </Field>
      {props.err && <ErrorBanner message={props.err} />}
      <button
        type="submit"
        disabled={props.busy}
        data-testid="button-bootstrap"
        style={primaryButtonStyle(props.busy)}
      >
        {props.busy ? "Creating…" : "Create admin & sign in"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ht-ink-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--ht-ink-3)",
            marginTop: 4,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="login-error"
      style={{
        background: "var(--ht-tint-danger)",
        color: "var(--ht-danger)",
        border: "1px solid rgba(255,59,48,0.25)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12.5,
        fontWeight: 500,
        marginBottom: 14,
      }}
    >
      {message}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  background: "var(--ht-surface)",
  border: "1px solid var(--ht-border)",
  borderRadius: 10,
  fontSize: 14,
  color: "var(--ht-ink)",
  outline: "none",
  transition: "border-color 0.12s",
};

function primaryButtonStyle(busy: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 44,
    background: "var(--ht-orange)",
    color: "var(--ht-navy)",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.2,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    boxShadow: "0 6px 16px rgba(254,160,2,0.25)",
  };
}
