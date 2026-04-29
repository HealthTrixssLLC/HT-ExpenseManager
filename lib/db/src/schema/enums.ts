import { pgEnum } from "drizzle-orm/pg-core";

export const ROLE_VALUES = [
  "Employee",
  "Manager Approver",
  "Finance Approver",
  "Accounting Admin",
  "System Admin",
] as const;
export type Role = (typeof ROLE_VALUES)[number];
export const roleEnum = pgEnum("role", ROLE_VALUES);

export const WORKFLOW_STATUS_VALUES = [
  "Draft",
  "Submitted",
  "Manager Review",
  "Changes Requested",
  "Manager Approved",
  "Finance Review",
  "Finance Approved",
  "Posted to QuickBooks",
  "Ready for Payroll Reimbursement",
  "Paid Through Payroll",
  "Reconciled",
  "Rejected",
  "Voided",
  "Sync Error",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS_VALUES)[number];
export const workflowStatusEnum = pgEnum(
  "workflow_status",
  WORKFLOW_STATUS_VALUES,
);

export const PAYMENT_METHOD_VALUES = [
  "Personal Card",
  "Cash",
  "Company Card",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];
export const paymentMethodEnum = pgEnum(
  "payment_method",
  PAYMENT_METHOD_VALUES,
);

export const QBO_CONNECTION_STATUS_VALUES = [
  "connected",
  "disconnected",
  "error",
] as const;
export type QboConnectionStatus = (typeof QBO_CONNECTION_STATUS_VALUES)[number];
export const qboConnectionStatusEnum = pgEnum(
  "qbo_connection_status",
  QBO_CONNECTION_STATUS_VALUES,
);

export const QBO_POSTING_STATUS_VALUES = ["posted", "error"] as const;
export type QboPostingStatus = (typeof QBO_POSTING_STATUS_VALUES)[number];
export const qboPostingStatusEnum = pgEnum(
  "qbo_posting_status",
  QBO_POSTING_STATUS_VALUES,
);

export const PAYROLL_BATCH_STATUS_VALUES = [
  "Draft",
  "Marked Paid",
  "Reconciled",
] as const;
export type PayrollBatchStatus = (typeof PAYROLL_BATCH_STATUS_VALUES)[number];
export const payrollBatchStatusEnum = pgEnum(
  "payroll_batch_status",
  PAYROLL_BATCH_STATUS_VALUES,
);

export const RECONCILIATION_FLAG_VALUES = [
  "matched",
  "under",
  "over",
  "partial",
  "missing",
] as const;
export type ReconciliationFlag = (typeof RECONCILIATION_FLAG_VALUES)[number];
export const reconciliationFlagEnum = pgEnum(
  "reconciliation_flag",
  RECONCILIATION_FLAG_VALUES,
);
