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
