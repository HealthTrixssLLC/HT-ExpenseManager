/**
 * Backup & Restore admin page (System Admin only).
 *
 * Two cards: "Export backup" downloads a zip with manifest + payload (and
 * optionally receipt files); "Restore from backup" lets the admin pick a
 * zip, see a summary of what's inside, then type "RESTORE" to confirm.
 *
 * Uses raw `fetch` (not the generated client) for both endpoints because
 * one returns a binary stream and the other accepts a multipart upload —
 * neither shape is well served by the OpenAPI codegen we use elsewhere.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";
import { HtCard } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  DatabaseBackup,
  FileSearch,
  Loader2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getCsrfToken } from "@/lib/api";

type SystemResetSummary = {
  orgsReset: Array<{
    orgId: string;
    orgName: string;
    rowsWiped: Record<string, number>;
    rowsReseeded: Record<string, number>;
  }>;
  orgsFailed: Array<{ orgId: string; orgName: string; error: string }>;
  receiptFilesDeleted: number;
  receiptFileWarnings: string[];
};

type ManifestPreview = {
  backupSchemaVersion: number;
  appVersion: string;
  orgId: string;
  orgName: string;
  createdAt: string;
  includesReceiptFiles: boolean;
  receiptCount: number;
  rowCounts: Record<string, number>;
};

type RestoreSummary = {
  manifest: ManifestPreview;
  rowCountsRestored: Record<string, number>;
  receiptFilesRestored: number;
  receiptFileWarnings: string[];
};

const API_BASE =
  ((import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env
    ?.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export function BackupRestorePage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  // ---- export ----
  const [includeReceipts, setIncludeReceipts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const url = new URL(
        apiUrl("/api/admin/backup"),
        window.location.origin,
      );
      if (includeReceipts) url.searchParams.set("includeReceiptFiles", "1");
      const res = await fetch(url.toString(), {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^";]+)"?/i.exec(cd);
      a.href = downloadUrl;
      a.download = filenameMatch
        ? filenameMatch[1]
        : `healthtrix-backup-${new Date().toISOString()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ---- restore ----
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedManifest, setParsedManifest] = useState<ManifestPreview | null>(
    null,
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedReceiptCount, setParsedReceiptCount] = useState<number>(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const resetRestoreState = () => {
    setParsedManifest(null);
    setParseError(null);
    setParsedReceiptCount(0);
    setRestoreResult(null);
    setRestoreError(null);
  };

  /**
   * Parse the picked zip in-browser so the admin can see exactly what's
   * about to overwrite their org BEFORE typing RESTORE. We do this with
   * JSZip because the manifest is small (a few KB) and we don't want to
   * round-trip the file through the server just to preview it.
   */
  const handlePickFile = async (file: File | null) => {
    setPickedFile(file);
    resetRestoreState();
    if (!file) return;
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) {
        throw new Error("This file is not a Healthtrix backup (no manifest).");
      }
      const manifestText = await manifestEntry.async("string");
      const manifest = JSON.parse(manifestText) as ManifestPreview;
      if (
        typeof manifest.backupSchemaVersion !== "number" ||
        typeof manifest.orgId !== "string" ||
        !manifest.rowCounts ||
        typeof manifest.rowCounts !== "object"
      ) {
        throw new Error("This file's manifest.json is not a valid backup header.");
      }
      // Count receipt files actually present in the zip (not just the
      // manifest's claim) so the summary reflects reality.
      let count = 0;
      const folder = zip.folder("receipts");
      if (folder) {
        folder.forEach((_relativePath, entry) => {
          if (!entry.dir) count += 1;
        });
      }
      setParsedManifest(manifest);
      setParsedReceiptCount(count);
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const handleRestoreClick = () => {
    if (!pickedFile || !parsedManifest) return;
    setConfirmText("");
    setConfirmOpen(true);
  };

  const performRestore = async () => {
    if (!pickedFile) return;
    setRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const fd = new FormData();
      fd.append("backup", pickedFile);
      fd.append("confirm", "RESTORE");
      const csrf = getCsrfToken();
      const res = await fetch(apiUrl("/api/admin/restore"), {
        method: "POST",
        credentials: "same-origin",
        headers: csrf ? { "x-csrf-token": csrf } : {},
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try {
          const parsed = JSON.parse(text);
          detail = parsed.detail ?? parsed.title ?? text;
        } catch {
          /* ignore */
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const summary = JSON.parse(text) as RestoreSummary;
      setRestoreResult(summary);
      // Invalidate every cache so the rest of the app reflects the restored data.
      qc.invalidateQueries();
      setPickedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setRestoreError((err as Error).message);
    } finally {
      setRestoring(false);
      setConfirmOpen(false);
    }
  };

  // ---- system reset (Task #41) ----
  // The reset has a hard prerequisite that the admin downloads a forced
  // safety-net of the entire system before continuing. We track that as
  // a one-time gate keyed by a timestamp so navigating away and back
  // forces a fresh download (we never trust a stale safety-net).
  const [systemBackupDownloadedAt, setSystemBackupDownloadedAt] = useState<
    string | null
  >(null);
  const [systemBackupDownloading, setSystemBackupDownloading] = useState(false);
  const [systemBackupError, setSystemBackupError] = useState<string | null>(
    null,
  );
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<SystemResetSummary | null>(
    null,
  );

  const downloadSystemBackup = async () => {
    setSystemBackupDownloading(true);
    setSystemBackupError(null);
    try {
      // Always include receipt files in the safety-net so a worst-case
      // restore is fully self-contained; this is the user's last
      // chance to capture the blobs before they're deleted.
      const url = new URL(
        apiUrl("/api/admin/system-backup?includeReceiptFiles=1"),
        window.location.origin,
      );
      const res = await fetch(url.toString(), {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^";]+)"?/i.exec(cd);
      a.href = downloadUrl;
      a.download = filenameMatch
        ? filenameMatch[1]
        : `healthtrix-system-backup-${new Date().toISOString()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
      setSystemBackupDownloadedAt(new Date().toISOString());
    } catch (err) {
      setSystemBackupError((err as Error).message);
    } finally {
      setSystemBackupDownloading(false);
    }
  };

  const performSystemReset = async () => {
    setResetting(true);
    setResetError(null);
    setResetResult(null);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(apiUrl("/api/admin/system-reset"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try {
          const parsed = JSON.parse(text);
          detail = parsed.detail ?? parsed.title ?? text;
        } catch {
          /* ignore */
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const summary = JSON.parse(text) as SystemResetSummary;
      setResetResult(summary);
      // Invalidate every cache; the rest of the app no longer reflects
      // anything still in memory.
      qc.invalidateQueries();
      setResetDialogOpen(false);
      // Wait briefly so the user sees the success summary, then force a
      // re-login. The reset deletes every other user's session and
      // wipes all user-scoped data — even the acting admin should
      // re-authenticate so their session token is refreshed against the
      // post-reset DB.
      window.setTimeout(() => {
        void logout();
      }, 2500);
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="page-backup-restore">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Backup &amp; Restore
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Export everything in your org to a single ZIP file, or restore
            from a previously-downloaded backup.
          </p>
        </div>
        <HelpLink topicId="admin-backup-restore" />
      </div>

      <HtCard>
        <div className="flex items-start gap-3 mb-4">
          <DatabaseBackup className="w-5 h-5 mt-0.5 text-[var(--ht-ink-2)]" />
          <div>
            <h2 className="text-lg font-semibold">Export backup</h2>
            <p className="text-sm text-[var(--ht-ink-3)]">
              Includes departments, GL mappings, policy rules, QuickBooks
              connection details, users, expense reports, line items, audit
              entries, and payroll batches scoped to your org.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
          <Checkbox
            id="include-receipts"
            checked={includeReceipts}
            onCheckedChange={(v) => setIncludeReceipts(v === true)}
            data-testid="checkbox-include-receipts"
          />
          <span>
            Also include uploaded receipt image files (much larger)
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleExport}
            disabled={exporting}
            data-testid="btn-download-backup"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Download backup
              </>
            )}
          </Button>
          {exportError && (
            <span
              className="text-sm text-red-600"
              data-testid="text-export-error"
            >
              {exportError}
            </span>
          )}
        </div>
      </HtCard>

      <HtCard>
        <div className="flex items-start gap-3 mb-4">
          <Upload className="w-5 h-5 mt-0.5 text-[var(--ht-ink-2)]" />
          <div>
            <h2 className="text-lg font-semibold">Restore from backup</h2>
            <p className="text-sm text-[var(--ht-ink-3)]">
              Restoring will{" "}
              <strong>
                permanently delete every record currently in this org
              </strong>{" "}
              (departments, users, expense reports, payroll batches, audit
              log, etc.) and replace it with the contents of the uploaded
              backup. Backups can only be restored into the org they were
              exported from.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="backup-file" className="text-sm">
              Backup file (.zip)
            </Label>
            <Input
              id="backup-file"
              type="file"
              accept=".zip,application/zip"
              ref={fileRef}
              onChange={(e) =>
                handlePickFile(e.target.files?.[0] ?? null)
              }
              data-testid="input-backup-file"
            />
            {pickedFile && (
              <p className="text-xs text-[var(--ht-ink-3)] mt-1">
                Selected:{" "}
                <span className="font-mono">{pickedFile.name}</span> (
                {(pickedFile.size / 1024).toFixed(1)} KB)
                {parsing && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[var(--ht-ink-3)]">
                    <Loader2 className="w-3 h-3 animate-spin" /> reading…
                  </span>
                )}
              </p>
            )}
          </div>

          {parseError && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"
              data-testid="text-parse-error"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Can't read this backup</div>
                <div className="text-xs">{parseError}</div>
              </div>
            </div>
          )}

          {parsedManifest && !parseError && (
            <div
              className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-1"
              data-testid="text-parsed-summary"
            >
              <div className="flex items-center gap-2 font-medium">
                <FileSearch className="w-4 h-4" />
                What this backup contains
              </div>
              <div className="text-xs">
                Org{" "}
                <span className="font-mono">
                  {parsedManifest.orgName} ({parsedManifest.orgId.slice(0, 8)}…)
                </span>
                , taken on{" "}
                {new Date(parsedManifest.createdAt).toLocaleString()} at app
                version {parsedManifest.appVersion} (schema v
                {parsedManifest.backupSchemaVersion}).
              </div>
              <ul
                className="list-disc list-inside text-xs space-y-0.5"
                data-testid="list-parsed-rowcounts"
              >
                {Object.entries(parsedManifest.rowCounts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([table, count]) => (
                    <li key={table}>
                      <code>{table}</code>: {count}
                    </li>
                  ))}
                {parsedManifest.includesReceiptFiles && (
                  <li>
                    Receipt files in archive: {parsedReceiptCount} (manifest
                    claims {parsedManifest.receiptCount})
                  </li>
                )}
              </ul>
              <div className="text-xs italic mt-1">
                Restoring this backup will <strong>replace</strong> every
                record currently in your org.
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              onClick={handleRestoreClick}
              disabled={
                !pickedFile || !parsedManifest || parsing || restoring
              }
              data-testid="btn-restore-open"
            >
              {restoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>Restore from this file</>
              )}
            </Button>
            {restoreError && (
              <span
                className="text-sm text-red-600"
                data-testid="text-restore-error"
              >
                {restoreError}
              </span>
            )}
          </div>

          {restoreResult && (
            <div
              className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"
              data-testid="text-restore-summary"
            >
              <div className="font-medium mb-1">
                Restore complete · {restoreResult.manifest.orgName}
              </div>
              <div className="text-xs">
                Backup taken on{" "}
                {new Date(restoreResult.manifest.createdAt).toLocaleString()}{" "}
                at app version {restoreResult.manifest.appVersion} (schema v
                {restoreResult.manifest.backupSchemaVersion}).
              </div>
              <ul className="list-disc list-inside text-xs mt-2 space-y-0.5">
                {Object.entries(restoreResult.rowCountsRestored).map(
                  ([table, count]) => (
                    <li key={table}>
                      <code>{table}</code>: {count}
                    </li>
                  ),
                )}
                {restoreResult.receiptFilesRestored > 0 && (
                  <li>
                    Receipt files re-uploaded:{" "}
                    {restoreResult.receiptFilesRestored}
                  </li>
                )}
                {restoreResult.receiptFileWarnings.length > 0 && (
                  <li className="text-amber-700">
                    Warnings: {restoreResult.receiptFileWarnings.length}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </HtCard>

      {/* System Reset (Task #41) — visually separated by a heading and a
          red border on the card so it can never be confused with the
          per-org Restore action above. */}
      <HtCard style={{ borderColor: "rgb(252, 165, 165)" }}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600" />
          <div>
            <h2 className="text-lg font-semibold text-red-700">
              Factory reset entire system
            </h2>
            <p className="text-sm text-[var(--ht-ink-3)]">
              Wipes <strong>every org's</strong> operational data — expense
              reports, line items, receipts (including uploaded files),
              audit log, payroll batches, QuickBooks connections, GL
              mappings, policy rules, departments, employee profiles, and
              all users <em>except your own account</em>. After the wipe,
              every org is re-seeded with the same factory defaults a
              freshly-created org gets. The orgs themselves are kept so
              external bookmarks keep resolving. <strong>This cannot
              be undone.</strong>
            </p>
          </div>
        </div>

        <ol className="list-decimal list-inside text-sm space-y-2 mb-4 text-[var(--ht-ink-2)]">
          <li>
            Download a full-system safety-net backup (one zip per org plus
            a top-level manifest).
          </li>
          <li>Type <code>RESET</code> in the confirmation dialog.</li>
          <li>
            You will be signed out automatically — sign back in to use
            the freshly-reset system.
          </li>
        </ol>

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={downloadSystemBackup}
              disabled={systemBackupDownloading || resetting}
              data-testid="btn-system-backup"
            >
              {systemBackupDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing system backup...
                </>
              ) : (
                <>
                  <DatabaseBackup className="w-4 h-4 mr-2" />
                  Download full-system backup
                </>
              )}
            </Button>
            {systemBackupDownloadedAt && !systemBackupError && (
              <span
                className="text-xs text-green-700 inline-flex items-center gap-1"
                data-testid="text-system-backup-stamp"
              >
                <CheckCircle2 className="w-4 h-4" />
                Downloaded at{" "}
                {new Date(systemBackupDownloadedAt).toLocaleString()}
              </span>
            )}
            {systemBackupError && (
              <span
                className="text-sm text-red-600"
                data-testid="text-system-backup-error"
              >
                {systemBackupError}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="destructive"
              onClick={() => {
                setResetConfirmText("");
                setResetError(null);
                setResetDialogOpen(true);
              }}
              disabled={
                !systemBackupDownloadedAt || systemBackupDownloading || resetting
              }
              data-testid="btn-system-reset-open"
            >
              {resetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>Factory reset every org</>
              )}
            </Button>
            {!systemBackupDownloadedAt && (
              <span className="text-xs text-[var(--ht-ink-3)] italic">
                Download the safety-net backup first to enable this button.
              </span>
            )}
            {resetError && (
              <span
                className="text-sm text-red-600"
                data-testid="text-system-reset-error"
              >
                {resetError}
              </span>
            )}
          </div>

          {resetResult && (
            <div
              className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"
              data-testid="text-system-reset-summary"
            >
              <div className="font-medium mb-1">
                System reset complete — {resetResult.orgsReset.length} org
                {resetResult.orgsReset.length === 1 ? "" : "s"} reset,{" "}
                {resetResult.orgsFailed.length} failed.
              </div>
              <div className="text-xs">
                Receipt files deleted: {resetResult.receiptFilesDeleted}.{" "}
                {resetResult.receiptFileWarnings.length > 0 &&
                  `${resetResult.receiptFileWarnings.length} blob warning(s).`}
              </div>
              <div className="text-xs mt-2 italic">
                You will be signed out shortly. Please sign in again.
              </div>
              {resetResult.orgsFailed.length > 0 && (
                <ul className="list-disc list-inside text-xs mt-2 space-y-0.5 text-red-700">
                  {resetResult.orgsFailed.map((o) => (
                    <li key={o.orgId}>
                      <strong>{o.orgName}:</strong> {o.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </HtCard>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent data-testid="dialog-system-reset-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm factory reset</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete</strong> every org's
              operational data and re-seed factory defaults. Your own
              account ({user?.email ?? "your admin user"}) will be the
              only user remaining in your org; every other user across
              every org will be deleted.
              <br />
              <br />
              Type <strong>RESET</strong> below to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="RESET"
            autoFocus
            data-testid="input-system-reset-confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-system-reset-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (resetConfirmText === "RESET") void performSystemReset();
              }}
              disabled={resetConfirmText !== "RESET" || resetting}
              data-testid="btn-system-reset-confirm"
            >
              {resetting ? "Resetting..." : "Reset everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-restore-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm restore</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace <strong>every record</strong> in{" "}
              <strong>{user?.fullName ? "your org" : "this org"}</strong>{" "}
              with the contents of{" "}
              <span className="font-mono">{pickedFile?.name}</span>. The
              action cannot be undone from inside the app.
              <br />
              <br />
              Type <strong>RESTORE</strong> below to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTORE"
            autoFocus
            data-testid="input-restore-confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-restore-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmText === "RESTORE") void performRestore();
              }}
              disabled={confirmText !== "RESTORE" || restoring}
              data-testid="btn-restore-confirm"
            >
              {restoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
