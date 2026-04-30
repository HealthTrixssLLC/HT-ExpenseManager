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
export function roleCanCreateOwnReports(_role: Role): boolean {
  return true;
}

export function roleCanManagerReview(role: Role): boolean {
  return (
    role === "Manager Approver" ||
    role === "Accounting Admin" ||
    role === "System Admin"
  );
}

export function roleCanFinanceReview(role: Role): boolean {
  return (
    role === "Finance Approver" ||
    role === "Accounting Admin" ||
    role === "System Admin"
  );
}

export function roleCanAdmin(role: Role): boolean {
  return role === "Accounting Admin" || role === "System Admin";
}

export function roleCanViewAnalytics(_role: Role): boolean {
  return true;
}
