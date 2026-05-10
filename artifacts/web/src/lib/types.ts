/**
 * Local re-exports of the workflow vocabulary. These mirror the OpenAPI
 * Role + WorkflowStatus enums so we get autocomplete without sprinkling
 * imports of the generated schemas everywhere.
 *
 * Status strings are rendered VERBATIM in the UI per the task contract;
 * never abbreviate, translate, or localize.
 */
export type WorkflowStatus =
  | "Draft"
  | "Submitted"
  | "Manager Review"
  | "Changes Requested"
  | "Manager Approved"
  | "Finance Review"
  | "Finance Approved"
  | "Posted to QuickBooks"
  | "Ready for Payroll Reimbursement"
  | "Paid Through Payroll"
  | "Reconciled"
  | "Rejected"
  | "Voided"
  | "Sync Error";

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

export type Role =
  | "Employee"
  | "Manager Approver"
  | "Finance Approver"
  | "Accounting Admin"
  | "System Admin";

/**
 * Whether a user with the given role can also act as an employee submitting
 * their own reports. Per the API, every role can create reports — even
 * admins — so this is currently a no-op gate. Kept for symmetry with the
 * mockups' role badges.
 */
export function hasAnyRole(roles: Role[], allowed: readonly Role[]): boolean {
  const set = new Set<Role>(allowed);
  return roles.some((r) => set.has(r));
}

export function roleCanCreateOwnReports(_roles: Role[]): boolean {
  return true;
}

export function roleCanManagerReview(roles: Role[]): boolean {
  return hasAnyRole(roles, [
    "Manager Approver",
    "Accounting Admin",
    "System Admin",
  ]);
}

export function roleCanFinanceReview(roles: Role[]): boolean {
  return hasAnyRole(roles, [
    "Finance Approver",
    "Accounting Admin",
    "System Admin",
  ]);
}

export function roleCanAdmin(roles: Role[]): boolean {
  return hasAnyRole(roles, ["Accounting Admin", "System Admin"]);
}

/**
 * System-Admin-only operations such as backup & restore. Accounting Admins
 * intentionally cannot trigger these, since they would wipe org data.
 */
export function roleCanSysAdmin(roles: Role[]): boolean {
  return hasAnyRole(roles, ["System Admin"]);
}

export function roleCanViewAnalytics(_roles: Role[]): boolean {
  return true;
}
