import type { WorkflowStatus } from "@workspace/api-client-react";
import { HT } from "./colors";

export const WORKFLOW_ORDER: WorkflowStatus[] = [
  "Draft",
  "Submitted",
  "Manager Review",
  "Manager Approved",
  "Finance Review",
  "Finance Approved",
  "Posted to QuickBooks",
  "Ready for Payroll Reimbursement",
  "Paid Through Payroll",
  "Reconciled",
];

export const OFF_RAMPS: WorkflowStatus[] = [
  "Changes Requested",
  "Rejected",
  "Voided",
  "Sync Error",
];

export type StatusTint = { bg: string; fg: string; dot: string };

export const STATUS_TINTS: Record<WorkflowStatus, StatusTint> = {
  Draft:                          { bg: HT.tintGrey,    fg: "#3F4A5C",   dot: HT.lightGrey },
  Submitted:                      { bg: HT.tintNavy,    fg: HT.navy,     dot: HT.navy },
  "Manager Review":               { bg: HT.tintTeal,    fg: HT.teal,     dot: HT.teal },
  "Changes Requested":            { bg: HT.tintOrange,  fg: "#8A4F00",   dot: HT.orange },
  "Manager Approved":             { bg: HT.tintGreen,   fg: "#34604F",   dot: HT.lightGreen },
  "Finance Review":               { bg: HT.tintTeal,    fg: HT.teal,     dot: HT.lightTeal },
  "Finance Approved":             { bg: HT.tintGreen,   fg: "#2F6E55",   dot: HT.lightGreen },
  "Posted to QuickBooks":         { bg: HT.tintTan,     fg: "#7A5512",   dot: HT.tan },
  "Ready for Payroll Reimbursement": { bg: HT.tintOrange, fg: "#8A4F00", dot: HT.lightOrange },
  "Paid Through Payroll":         { bg: HT.tintTan,     fg: "#6F4F12",   dot: HT.orange },
  Reconciled:                     { bg: HT.tintSuccess, fg: HT.success,  dot: HT.success },
  Rejected:                       { bg: HT.tintDanger,  fg: HT.danger,   dot: HT.danger },
  Voided:                         { bg: HT.tintGrey,    fg: "#5A6273",   dot: HT.lightGrey },
  "Sync Error":                   { bg: HT.tintDanger,  fg: HT.danger,   dot: HT.danger },
};

export function isTerminal(status: WorkflowStatus): boolean {
  return status === "Reconciled" || OFF_RAMPS.includes(status);
}

// Statuses where the API allows field-level edits. Mirrors the broader
// owner+manager+delegate edit gate enforced by the api-server. The mobile
// surface is owner-only (no manager-edit on mobile per the task contract),
// but we still need to recognize the same status set so the owner can
// continue editing their own report after submission.
const MOBILE_EDITABLE_STATUSES: WorkflowStatus[] = [
  "Draft",
  "Submitted",
  "Manager Review",
  "Changes Requested",
  "Manager Approved",
  "Finance Review",
];

export function isEditable(status: WorkflowStatus): boolean {
  return MOBILE_EDITABLE_STATUSES.includes(status);
}
