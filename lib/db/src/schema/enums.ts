/**
 * Postgres enum definitions and matching TypeScript union types.
 *
 * The `*_VALUES` const tuples are the single source of truth — both the
 * `pgEnum(...)` and the exported `Role` / `WorkflowStatus` / etc. unions are
 * derived from them. Add a new value to the tuple, generate a Drizzle
 * migration, and the rest of the stack (zod schemas, generated client) picks
 * it up automatically.
 */
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

export const QBO_POSTING_STATUS_VALUES = ["posted", "retried", "error"] as const;
export type QboPostingStatus = (typeof QBO_POSTING_STATUS_VALUES)[number];
export const qboPostingStatusEnum = pgEnum(
  "qbo_posting_status",
  QBO_POSTING_STATUS_VALUES,
);

export const QBO_ENVIRONMENT_VALUES = ["sandbox", "production"] as const;
export type QboEnvironment = (typeof QBO_ENVIRONMENT_VALUES)[number];
export const qboEnvironmentEnum = pgEnum(
  "qbo_environment",
  QBO_ENVIRONMENT_VALUES,
);

export const QBO_CONNECTION_HEALTH_VALUES = [
  "healthy",
  "refresh_failed",
  "reconnect_required",
  "disconnected",
] as const;
export type QboConnectionHealth =
  (typeof QBO_CONNECTION_HEALTH_VALUES)[number];
export const qboConnectionHealthEnum = pgEnum(
  "qbo_connection_health",
  QBO_CONNECTION_HEALTH_VALUES,
);

export const QBO_CONNECTION_MODE_VALUES = ["stub", "real"] as const;
export type QboConnectionMode = (typeof QBO_CONNECTION_MODE_VALUES)[number];
export const qboConnectionModeEnum = pgEnum(
  "qbo_connection_mode",
  QBO_CONNECTION_MODE_VALUES,
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
