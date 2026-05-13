import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetQboConnection,
  getAdminGetQboConnectionQueryKey,
  useAdminGetQboConnectionHealth,
  getAdminGetQboConnectionHealthQueryKey,
  useAdminConnectQboStub,
  useAdminDisconnectQbo,
  useAdminPreflightQboConnection,
  useAdminSaveQboCredentials,
  useAdminSaveQboPostingPreferences,
  useAdminStartQboOauth,
  useAdminRefreshQboToken,
  useAdminListQboPostingHistory,
  getAdminListQboPostingHistoryQueryKey,
  type QboConnection,
  type QboPreflightResult,
} from "@workspace/api-client-react";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Unlink,
  XCircle,
  Zap,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { GlEntryValidationDialog } from "@/components/qbo/GlEntryValidationDialog";

// Compute the OAuth redirect URI we will register on Intuit. Mirrors
// resolveQboRedirectUri on the server — same algorithm so the value shown to
// the admin matches the one the server actually sends to Intuit.
function computeRedirectUri(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  return `${protocol}//${host}/api/admin/qbo-connection/oauth/callback`;
}

/**
 * Build a deep-link to a journal entry inside the QBO console. Production
 * lives at app.qbo.intuit.com, sandbox at app.sandbox.qbo.intuit.com. We pass
 * the realmId via the `cid` query parameter so the link lands on the right
 * company when the user is signed into multiple QBO companies.
 */
function qboJournalDeepLink(
  environment: "sandbox" | "production",
  realmId: string | null,
  qboJournalId: string,
): string {
  const host =
    environment === "production"
      ? "https://app.qbo.intuit.com"
      : "https://app.sandbox.qbo.intuit.com";
  const url = new URL(`${host}/app/journal`);
  url.searchParams.set("txnId", qboJournalId);
  if (realmId) url.searchParams.set("cid", realmId);
  return url.toString();
}

export function QboPage() {
  const qc = useQueryClient();
  const [location, setLocation] = useLocation();

  // Banner driven by the OAuth callback's redirect query string.
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("qboStatus");
    const message = params.get("qboMessage");
    if (status === "connected") {
      setBanner({ tone: "success", text: "QuickBooks connected successfully." });
    } else if (status === "error") {
      setBanner({
        tone: "error",
        text: message ?? "QuickBooks connection failed. Please try again.",
      });
    }
    if (status) {
      // Strip the params so a refresh doesn't keep showing the banner.
      const url = new URL(window.location.href);
      url.searchParams.delete("qboStatus");
      url.searchParams.delete("qboMessage");
      window.history.replaceState({}, "", url.toString());
      void location;
      void setLocation;
    }
  }, [location, setLocation]);

  const { data: connection, isLoading } = useAdminGetQboConnection({
    query: { queryKey: getAdminGetQboConnectionQueryKey() },
  });

  const refetchConn = () =>
    qc.invalidateQueries({ queryKey: getAdminGetQboConnectionQueryKey() });

  return (
    <div className="space-y-6" data-testid="page-qbo">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            QuickBooks Online Integration
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Connect Healthtrix Expense to QuickBooks to automatically post
            approved expense reports as journal entries.
          </p>
        </div>
        <HelpLink topicId="admin-qbo" />
      </div>

      {banner ? (
        <div
          className={`rounded-md border p-4 text-sm ${
            banner.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          data-testid="banner-qbo-status"
        >
          <div className="flex items-start gap-2">
            {banner.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
        </div>
      ) : null}

      {connection?.connectionHealth === "reconnect_required" ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="banner-reconnect-required"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Reconnect required</p>
              <p>
                Intuit rejected the most recent token refresh
                {connection.lastTokenRefreshError
                  ? `: ${connection.lastTokenRefreshError}`
                  : "."}
                {" "}Click <strong>Connect to QuickBooks</strong> below to
                re-authorize.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {isLoading || !connection ? (
          <HtCard>
            <div className="p-8 text-sm text-[var(--ht-ink-3)]">
              Loading connection…
            </div>
          </HtCard>
        ) : (
          <>
            <CredentialsCard conn={connection} onSaved={refetchConn} />
            <ConnectionCard conn={connection} onChanged={refetchConn} />
            <HealthCard conn={connection} />
            <PostingPreferencesCard conn={connection} onSaved={refetchConn} />
          </>
        )}
      </div>

      <ProductionAppUrlsCard />

      <PostingHistoryCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Production app URLs — read-only values to paste into Intuit's developer
// dashboard "Add your app's host domain, launch URL, disconnect URL, and
// connect/reconnect URL" form for the production app listing.
// ---------------------------------------------------------------------------
function ProductionAppUrlsCard() {
  const PROD_HOST = "HT-expense-management.replit.app";
  const PROD_BASE = `https://${PROD_HOST}`;
  const items: { id: string; label: string; value: string }[] = [
    { id: "host", label: "Host domain", value: PROD_HOST },
    { id: "launch", label: "Launch URL", value: `${PROD_BASE}/web/admin/qbo` },
    {
      id: "disconnect",
      label: "Disconnect URL",
      value: `${PROD_BASE}/api/admin/qbo-connection/oauth/callback`,
    },
    {
      id: "connect",
      label: "Connect/Reconnect URL",
      value: `${PROD_BASE}/api/admin/qbo-connection/oauth/callback`,
    },
  ];
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — admin can still triple-click to select */
    }
  };

  return (
    <HtCard data-testid="card-qbo-production-urls">
      <HtCardHeader title="Production app URLs" />
      <div className="space-y-4 p-6">
        <p className="text-sm text-[var(--ht-ink-3)]">
          Paste these values into Intuit's developer dashboard form: "Add your
          app's host domain, launch URL, disconnect URL, and connect/reconnect
          URL" for the production app listing.
        </p>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="space-y-1">
              <p className="text-xs font-medium text-[var(--ht-ink-2)]">
                {item.label}
              </p>
              <div className="flex items-stretch gap-2">
                <code
                  className="flex-1 break-all rounded bg-white p-2 font-mono text-[11px] text-[var(--ht-ink)] border border-[var(--ht-border)]"
                  data-testid={`text-prod-url-${item.id}`}
                >
                  {item.value}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(item.id, item.value)}
                  data-testid={`btn-copy-prod-url-${item.id}`}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  {copiedId === item.id ? "Copied!" : "Copy"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </HtCard>
  );
}

// ---------------------------------------------------------------------------
// Configuration card — paste Client ID + Client Secret + environment.
// ---------------------------------------------------------------------------
function CredentialsCard({
  conn,
  onSaved,
}: {
  conn: QboConnection;
  onSaved: () => void;
}) {
  const [environment, setEnvironment] = useState<"sandbox" | "production">(
    conn.environment,
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [preflight, setPreflight] = useState<QboPreflightResult | null>(null);

  useEffect(() => setEnvironment(conn.environment), [conn.environment]);

  const save = useAdminSaveQboCredentials();
  const runPreflight = useAdminPreflightQboConnection();

  const handleSave = () => {
    save.mutate(
      {
        data: {
          environment,
          ...(clientId ? { clientId } : {}),
          ...(clientSecret ? { clientSecret } : {}),
        },
      },
      {
        onSuccess: () => {
          setClientId("");
          setClientSecret("");
          setSavedAt(new Date());
          setPreflight(null);
          onSaved();
        },
      },
    );
  };

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(displayedRedirectUri);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      /* clipboard blocked — admin can still triple-click to select */
    }
  };

  const handlePreflight = () => {
    runPreflight.mutate(undefined, {
      onSuccess: (result) => setPreflight(result),
    });
  };

  const handleClear = () => {
    if (
      !confirm(
        "Clear stored Intuit credentials? You will need to re-enter Client ID/Secret to reconnect.",
      )
    ) {
      return;
    }
    save.mutate(
      { data: { environment, clientId: null, clientSecret: null } },
      {
        onSuccess: () => {
          setSavedAt(new Date());
          setPreflight(null);
          onSaved();
        },
      },
    );
  };

  const redirectUri = computeRedirectUri();
  // Prefer the server-resolved value once a preflight has been run — this
  // accounts for proxy / Host-header edge cases where the URI the API will
  // actually send to Intuit can differ from what the browser computes.
  const displayedRedirectUri = preflight?.resolvedRedirectUri ?? redirectUri;

  return (
    <HtCard data-testid="card-qbo-credentials">
      <HtCardHeader
        title="Configuration"
        right={<HelpLink topicId="admin-qbo-config" />}
      />
      <div className="space-y-5 p-6">
        {!conn.encryptionKeyConfigured ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            data-testid="banner-missing-encryption-key"
          >
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Encryption key is not configured</p>
                <p className="mt-1 text-xs">
                  Set <code className="rounded bg-red-100 px-1">QBO_CREDENTIAL_ENCRYPTION_KEY</code>{" "}
                  on the API server before saving Intuit credentials. Without it,
                  Client ID/Secret cannot be stored or decrypted.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-sm text-[var(--ht-ink-3)]">
          Provide your Intuit Developer app credentials. They are encrypted at
          rest and never echoed back. Real-mode posting requires both Client ID
          and Client Secret to be configured.
        </p>

        <div className="space-y-2">
          <Label>Environment</Label>
          <Select
            value={environment}
            onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}
          >
            <SelectTrigger
              className="w-full max-w-xs"
              data-testid="select-environment"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-id">
            Client ID
            {conn.hasClientId ? (
              <span className="ml-2 text-xs font-normal text-green-700">
                ✓ stored ({conn.clientIdMasked ?? "encrypted"})
              </span>
            ) : null}
          </Label>
          <Input
            id="client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={conn.hasClientId ? "Enter to replace" : "AB••••••"}
            data-testid="input-client-id"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-secret">
            Client Secret
            {conn.hasClientSecret ? (
              <span className="ml-2 text-xs font-normal text-green-700">
                ✓ stored
              </span>
            ) : null}
          </Label>
          <Input
            id="client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={conn.hasClientSecret ? "Enter to replace" : "•••••••"}
            data-testid="input-client-secret"
          />
        </div>

        <div className="rounded-md bg-[var(--ht-bg-2)] p-3 text-xs text-[var(--ht-ink-3)]">
          <p className="mb-2 font-medium text-[var(--ht-ink-2)]">
            OAuth redirect URI to register on Intuit
          </p>
          <p>
            On developer.intuit.com → Keys & OAuth → Redirect URIs, add this
            exact value (must match character-for-character):
          </p>
          <div className="mt-2 flex items-stretch gap-2">
            <code
              className="flex-1 break-all rounded bg-white p-2 font-mono text-[11px] text-[var(--ht-ink)]"
              data-testid="text-redirect-uri"
            >
              {displayedRedirectUri}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyRedirect}
              data-testid="btn-copy-redirect-uri"
            >
              <Copy className="mr-1 h-3 w-3" />
              {copyState === "copied" ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={
              save.isPending ||
              !conn.encryptionKeyConfigured ||
              (!clientId && !clientSecret && environment === conn.environment)
            }
            data-testid="btn-save-credentials"
          >
            {save.isPending ? "Saving…" : "Save credentials"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePreflight}
            disabled={runPreflight.isPending}
            data-testid="btn-test-configuration"
          >
            {runPreflight.isPending ? "Testing…" : "Test configuration"}
          </Button>
          {(conn.hasClientId || conn.hasClientSecret) && (
            <Button
              variant="ghost"
              onClick={handleClear}
              disabled={save.isPending}
              data-testid="btn-clear-credentials"
            >
              Clear stored credentials
            </Button>
          )}
          {savedAt ? (
            <span
              className="text-xs text-green-700"
              data-testid="text-saved-at"
            >
              Saved at {formatDateTime(savedAt.toISOString())}
            </span>
          ) : null}
        </div>

        {preflight ? (
          <PreflightChecklist result={preflight} />
        ) : null}
      </div>
    </HtCard>
  );
}

// Renders the preflight result: a checklist of pass/warn/fail rows with
// optional detail text. Used by CredentialsCard's "Test configuration".
function PreflightChecklist({ result }: { result: QboPreflightResult }) {
  const iconFor = (status: "pass" | "warn" | "fail") => {
    if (status === "pass")
      return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
    if (status === "warn")
      return (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      );
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
  };
  return (
    <div
      className="rounded-md border border-[var(--ht-border)] bg-white p-3"
      data-testid="preflight-checklist"
    >
      <p className="mb-2 text-xs font-semibold text-[var(--ht-ink-2)]">
        Configuration test results ({result.environment})
      </p>
      <ul className="space-y-2 text-sm">
        {result.checks.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2"
            data-testid={`preflight-check-${c.id}`}
          >
            {iconFor(c.status)}
            <div className="space-y-0.5">
              <p className="text-[var(--ht-ink)]">{c.label}</p>
              {c.detail ? (
                <p className="text-xs text-[var(--ht-ink-3)]">{c.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection card — connect (real or stub), disconnect, current status.
// ---------------------------------------------------------------------------
function ConnectionCard({
  conn,
  onChanged,
}: {
  conn: QboConnection;
  onChanged: () => void;
}) {
  const startOauth = useAdminStartQboOauth();
  const connectStub = useAdminConnectQboStub();
  const disconnect = useAdminDisconnectQbo();

  const isConnected = conn.status === "connected";
  const credentialsReady = conn.hasClientId && conn.hasClientSecret;

  const handleConnect = () => {
    startOauth.mutate(undefined, {
      onSuccess: (resp) => {
        // Same-tab redirect so the OAuth callback can come back to this page
        // with ?qboStatus= and re-render the success/error banner.
        window.location.href = resp.url;
      },
    });
  };

  const handleConnectStub = () => {
    connectStub.mutate(undefined, { onSuccess: () => onChanged() });
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        isConnected && conn.mode === "real"
          ? "Disconnect from QuickBooks? This revokes the Intuit refresh token and clears stored access tokens."
          : "Disconnect the demo connection?",
      )
    ) {
      return;
    }
    disconnect.mutate(undefined, { onSuccess: () => onChanged() });
  };

  return (
    <HtCard data-testid="card-qbo-connection">
      <HtCardHeader title="Connection" right={<HelpLink topicId="admin-qbo-oauth" />} />
      <div className="space-y-5 p-6">
        {isConnected ? (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Link2 className="h-5 w-5 text-green-700" />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-green-800">
                Connected{" "}
                {conn.mode === "real" ? "to QuickBooks Online" : "(demo stub)"}
              </p>
              <p className="text-[var(--ht-ink-3)]">
                {conn.companyName ?? "Company"}
                {conn.realmId ? ` · Realm ${conn.realmId}` : ""}
              </p>
              {conn.connectedAt ? (
                <p className="text-xs text-[var(--ht-ink-3)]">
                  Connected on {formatDateTime(conn.connectedAt)}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <Unlink className="h-5 w-5 text-gray-500" />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">Not connected</p>
              <p className="text-[var(--ht-ink-3)]">
                {credentialsReady
                  ? "Credentials are saved. Click Connect to open the Intuit OAuth flow."
                  : "Save Intuit Client ID + Secret in the Configuration card, or use the demo stub for a simulated connection."}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ht-border)] pt-4">
          {!isConnected && credentialsReady && (
            <Button
              onClick={handleConnect}
              disabled={startOauth.isPending}
              className="bg-[#2CA01C] text-white hover:bg-[#238116]"
              data-testid="btn-connect-real"
            >
              <Link2 className="mr-2 h-4 w-4" />
              {startOauth.isPending ? "Opening Intuit…" : "Connect to QuickBooks"}
            </Button>
          )}
          {!isConnected && !credentialsReady && (
            <Button
              onClick={handleConnectStub}
              disabled={connectStub.isPending}
              variant="outline"
              data-testid="btn-connect-stub"
            >
              <Zap className="mr-2 h-4 w-4" />
              {connectStub.isPending ? "Connecting…" : "Connect demo stub"}
            </Button>
          )}
          {isConnected && (
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
              data-testid="btn-disconnect"
            >
              <Unlink className="mr-2 h-4 w-4" />
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
          {credentialsReady && conn.mode === "real" && isConnected && (
            <Button
              variant="ghost"
              onClick={handleConnect}
              disabled={startOauth.isPending}
              data-testid="btn-reauthorize"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Re-authorize
            </Button>
          )}
        </div>
      </div>
    </HtCard>
  );
}

// ---------------------------------------------------------------------------
// Health card — token expiry, last refresh, manual refresh button.
// ---------------------------------------------------------------------------
function HealthCard({ conn }: { conn: QboConnection }) {
  const refresh = useAdminRefreshQboToken();
  const qc = useQueryClient();
  const { data: health } = useAdminGetQboConnectionHealth({
    query: {
      queryKey: getAdminGetQboConnectionHealthQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const handleRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getAdminGetQboConnectionQueryKey() });
        qc.invalidateQueries({
          queryKey: getAdminGetQboConnectionHealthQueryKey(),
        });
      },
    });
  };

  const healthValue = health?.health ?? conn.connectionHealth;
  const healthBadge = (() => {
    switch (healthValue) {
      case "healthy":
        return { label: "Healthy", color: "bg-green-100 text-green-800" };
      case "refresh_failed":
        return {
          label: "Refresh failed",
          color: "bg-amber-100 text-amber-800",
        };
      case "reconnect_required":
        return {
          label: "Reconnect required",
          color: "bg-red-100 text-red-800",
        };
      case "disconnected":
        return { label: "Disconnected", color: "bg-gray-100 text-gray-700" };
      default:
        return { label: healthValue, color: "bg-gray-100 text-gray-700" };
    }
  })();
  const recentAttempts = health?.recentRefreshAttempts ?? [];

  return (
    <HtCard data-testid="card-qbo-health">
      <HtCardHeader title="Health" right={<HelpLink topicId="admin-qbo-health" />} />
      <div className="space-y-4 p-6 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--ht-ink-3)]" />
          <span className="text-[var(--ht-ink-3)]">Status:</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthBadge.color}`}
            data-testid="badge-health"
          >
            {healthBadge.label}
          </span>
          <span className="text-xs text-[var(--ht-ink-3)]">
            ({conn.mode === "real" ? "Real" : "Stub"}, {conn.environment})
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ht-ink-3)]">Access token expires</dt>
            <dd className="text-[var(--ht-ink)]">
              {conn.tokenExpiresAt ? formatDateTime(conn.tokenExpiresAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ht-ink-3)]">Refresh token expires</dt>
            <dd className="text-[var(--ht-ink)]">
              {conn.refreshTokenExpiresAt
                ? formatDateTime(conn.refreshTokenExpiresAt)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ht-ink-3)]">Last token refresh</dt>
            <dd className="text-[var(--ht-ink)]">
              {conn.lastTokenRefreshAt
                ? formatDateTime(conn.lastTokenRefreshAt)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ht-ink-3)]">Last successful post</dt>
            <dd className="text-[var(--ht-ink)]">
              {conn.lastSuccessfulPostAt
                ? formatDateTime(conn.lastSuccessfulPostAt)
                : "—"}
            </dd>
          </div>
        </dl>

        {conn.lastTokenRefreshError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <strong>Last refresh error:</strong> {conn.lastTokenRefreshError}
          </div>
        ) : null}

        {recentAttempts.length > 0 ? (
          <div className="border-t border-[var(--ht-border)] pt-3">
            <div className="mb-2 text-xs font-semibold text-[var(--ht-ink-3)]">
              Recent token refresh attempts
            </div>
            <ul
              className="space-y-1 text-xs"
              data-testid="list-refresh-attempts"
            >
              {recentAttempts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3"
                  data-testid={`refresh-attempt-${a.id}`}
                >
                  <span className="text-[var(--ht-ink-3)]">
                    {formatDateTime(a.createdAt)}
                  </span>
                  <span
                    className={
                      a.success
                        ? "font-medium text-green-700"
                        : "text-red-700"
                    }
                  >
                    {a.success
                      ? `Success${
                          a.expiresInSeconds
                            ? ` (expires in ${Math.round(a.expiresInSeconds / 60)}m)`
                            : ""
                        }`
                      : (a.errorMessage ?? "Failed")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-[var(--ht-border)] pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refresh.isPending || conn.mode !== "real" || conn.status !== "connected"}
            data-testid="btn-refresh-token"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {refresh.isPending ? "Refreshing…" : "Force token refresh"}
          </Button>
        </div>
      </div>
    </HtCard>
  );
}

// ---------------------------------------------------------------------------
// Posting preferences card.
// ---------------------------------------------------------------------------
function PostingPreferencesCard({
  conn,
  onSaved,
}: {
  conn: QboConnection;
  onSaved: () => void;
}) {
  const [autoPost, setAutoPost] = useState(conn.autoPostOnApproval);
  const [memo, setMemo] = useState(conn.defaultMemoTemplate ?? "");
  const [acctId, setAcctId] = useState(conn.defaultPayableAccountId ?? "");
  const [acctName, setAcctName] = useState(conn.defaultPayableAccountName ?? "");

  useEffect(() => setAutoPost(conn.autoPostOnApproval), [conn.autoPostOnApproval]);
  useEffect(() => setMemo(conn.defaultMemoTemplate ?? ""), [conn.defaultMemoTemplate]);
  useEffect(
    () => setAcctId(conn.defaultPayableAccountId ?? ""),
    [conn.defaultPayableAccountId],
  );
  useEffect(
    () => setAcctName(conn.defaultPayableAccountName ?? ""),
    [conn.defaultPayableAccountName],
  );

  const save = useAdminSaveQboPostingPreferences();

  const handleSave = () => {
    save.mutate(
      {
        data: {
          autoPostOnApproval: autoPost,
          defaultMemoTemplate: memo || null,
          defaultPayableAccountId: acctId || null,
          defaultPayableAccountName: acctName || null,
        },
      },
      { onSuccess: () => onSaved() },
    );
  };

  const dirty = useMemo(
    () =>
      autoPost !== conn.autoPostOnApproval ||
      memo !== (conn.defaultMemoTemplate ?? "") ||
      acctId !== (conn.defaultPayableAccountId ?? "") ||
      acctName !== (conn.defaultPayableAccountName ?? ""),
    [autoPost, memo, acctId, acctName, conn],
  );

  return (
    <HtCard data-testid="card-qbo-prefs">
      <HtCardHeader title="Posting preferences" />
      <div className="space-y-4 p-6 text-sm">
        <div className="flex items-start gap-3">
          <Switch
            id="auto-post"
            checked={autoPost}
            onCheckedChange={setAutoPost}
            data-testid="switch-auto-post"
          />
          <div className="space-y-0.5">
            <Label htmlFor="auto-post" className="cursor-pointer">
              Auto-post on finance approval
            </Label>
            <p className="text-xs text-[var(--ht-ink-3)]">
              When enabled, finance approval triggers an immediate post to QBO
              instead of leaving the report queued for manual posting.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-memo">Default memo template</Label>
          <Textarea
            id="default-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="e.g. Healthtrix Expense — {report.displayCode}"
            data-testid="input-memo"
          />
          <p className="text-xs text-[var(--ht-ink-3)]">
            Used as the JournalEntry memo when no per-report memo is set.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default-acct-id">Default payable account ID</Label>
            <Input
              id="default-acct-id"
              value={acctId}
              onChange={(e) => setAcctId(e.target.value)}
              placeholder="e.g. 33"
              data-testid="input-acct-id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-acct-name">Account name (display)</Label>
            <Input
              id="default-acct-name"
              value={acctName}
              onChange={(e) => setAcctName(e.target.value)}
              placeholder="e.g. Accounts Payable"
              data-testid="input-acct-name"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--ht-border)] pt-3">
          <Button
            onClick={handleSave}
            disabled={!dirty || save.isPending}
            data-testid="btn-save-prefs"
          >
            {save.isPending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </div>
    </HtCard>
  );
}

// ---------------------------------------------------------------------------
// Posting history table.
// ---------------------------------------------------------------------------
function PostingHistoryCard() {
  const { data: rows = [], isLoading } = useAdminListQboPostingHistory(
    { limit: 25 },
    { query: { queryKey: getAdminListQboPostingHistoryQueryKey({ limit: 25 }) } },
  );
  // Validate-GL modal state. We track both the report and posting event
  // ids so the modal can fetch the persisted payload for that specific
  // attempt (rather than rebuilding live).
  const [validateState, setValidateState] = useState<{
    reportId: string;
    postingEventId: string;
    reportLabel: string;
  } | null>(null);

  return (
    <HtCard data-testid="card-qbo-posting-history">
      <HtCardHeader title="Posting history" right={<HelpLink topicId="admin-qbo-posting-history" />} />
      <GlEntryValidationDialog
        open={validateState !== null}
        onOpenChange={(next) => {
          if (!next) setValidateState(null);
        }}
        reportId={validateState?.reportId ?? null}
        postingEventId={validateState?.postingEventId ?? null}
        reportLabel={validateState?.reportLabel ?? null}
      />
      {isLoading ? (
        <div className="p-6 text-sm text-[var(--ht-ink-3)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-sm text-[var(--ht-ink-3)]">
          No QBO posting attempts yet. Approved reports will show up here once
          finance posts them.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Report</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>QBO Journal ID</TableHead>
              <TableHead>Attachments</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Validate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`row-history-${r.id}`}>
                <TableCell className="text-xs text-[var(--ht-ink-3)]">
                  {formatDateTime(r.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.reportDisplayCode}
                </TableCell>
                <TableCell>
                  {r.status === "posted" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      <CheckCircle2 className="h-3 w-3" /> Posted
                    </span>
                  ) : r.status === "retried" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      title="Posted after a previous Sync Error on this report."
                    >
                      <RotateCcw className="h-3 w-3" /> Retried
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      <AlertCircle className="h-3 w-3" /> Error
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.qboJournalId ? (
                    <a
                      href={qboJournalDeepLink(
                        r.environment,
                        r.realmId ?? null,
                        r.qboJournalId,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--ht-accent)] hover:underline"
                      data-testid={`link-qbo-journal-${r.id}`}
                      title={
                        r.environment === "production"
                          ? "Open in QuickBooks Online (Production)"
                          : "Open in QuickBooks Online (Sandbox)"
                      }
                    >
                      {r.qboJournalId}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-xs">{r.attachableCount}</TableCell>
                <TableCell className="text-xs">
                  {r.tagsSent.length > 0 ? r.tagsSent.join(", ") : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-[var(--ht-ink-3)]">
                  {r.errorMessage ?? r.journalId}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setValidateState({
                        reportId: r.reportId,
                        postingEventId: r.id,
                        reportLabel: r.reportDisplayCode,
                      })
                    }
                    data-testid={`btn-validate-gl-${r.id}`}
                  >
                    <ShieldCheck className="mr-1 h-3 w-3" /> Validate GL entry
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HtCard>
  );
}
