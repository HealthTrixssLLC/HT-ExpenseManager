import type { ExpenseReport, User, WorkflowStatus } from "@workspace/api-client-react";
import type { Role } from "./types";

// Statuses where field-level edits are allowed by the API. The API is
// authoritative — this client-side check only mirrors the same set so the
// UI can hide edit affordances. The API enforces the same gate via
// `canEditReport` in `lib/reports.ts`.
export const EDITABLE_STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  "Draft",
  "Submitted",
  "Manager Review",
  "Changes Requested",
  "Manager Approved",
  "Finance Review",
] as WorkflowStatus[]);

// Best-effort client gate. Does NOT cover the delegate-of-manager case
// (the client doesn't know who has an active delegation today). The API
// is the source of truth and will return 403 if the user is unauthorized;
// in that case the worst that happens is the user sees an Edit button but
// gets an inline error when they try to save.
export function canEditReportClient(
  report: ExpenseReport,
  user: User | null,
  roles: Role[],
): boolean {
  if (!user) return false;
  if (!EDITABLE_STATUSES.has(report.status)) return false;

  // Owner always wins.
  if (report.employee.id === user.id) return true;

  // Per Task #25: only owner / direct manager / active delegate may edit.
  // Admin roles do NOT get a content-edit bypass — admins observe and
  // audit but should not impersonate the owner on financial records.
  // We deliberately check ONLY the "Manager Approver" role here (NOT
  // `roleCanManagerReview`, which would include admin roles by design
  // for the queue pages). Direct-manager and delegate-of-manager cases
  // are impossible to fully resolve client-side (UserRef doesn't carry
  // managerId, and we don't know who has an active delegation), so
  // any Manager Approver gets a tentative true; the API performs the
  // authoritative check and returns 403 inline if they aren't actually
  // the owner's manager or an active delegate.
  if (roles.includes("Manager Approver")) return true;

  return false;
}
