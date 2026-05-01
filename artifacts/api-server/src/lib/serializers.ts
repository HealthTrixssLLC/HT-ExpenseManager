import type {
  ApprovalAction,
  AuditAction,
  AuditEntityType,
  AuditEntry,
  AuditFieldDiff,
  Department,
  ExpenseReport,
  GlMapping,
  LineItem,
  PayrollBatch,
  PayrollBatchItem,
  PolicyRule,
  QboConnection,
  Receipt,
  ReconciliationRecord,
  Role,
  User,
  WorkflowStatus,
} from "@workspace/db";

export type UserRefDto = {
  id: string;
  fullName: string;
  roles: Role[];
};

export type UserDto = {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  roles: Role[];
  isAlsoEmployee: boolean;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  createdAt: string;
};

export type LineItemDto = {
  id: string;
  reportId: string;
  occurredOn: string;
  merchant: string;
  description: string;
  category: string;
  amount: string;
  paymentMethod: LineItem["paymentMethod"];
  needsReview: boolean;
  receiptCount: number;
  createdAt: string;
};

export type ReceiptDto = {
  id: string;
  reportId: string | null;
  lineItemId: string | null;
  objectPath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
};

export type ApprovalActionDto = {
  id: string;
  reportId: string;
  actor: UserRefDto;
  actorRoles: Role[];
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  comment: string | null;
  metadata: string | null;
  sequence: number;
  createdAt: string;
};

export type ExpenseReportSummaryDto = {
  id: string;
  displayCode: string;
  title: string;
  employee: UserRefDto;
  departmentName: string | null;
  period: string | null;
  status: WorkflowStatus;
  total: string;
  lineCount: number;
  receiptCount: number;
  needsReceipt: boolean;
  submittedAt: string | null;
  ageDays: number;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseReportDto = ExpenseReportSummaryDto & {
  description: string;
  departmentId: string | null;
  policy: string;
  periodStart: string | null;
  periodEnd: string | null;
  lineItems: LineItemDto[];
  receipts: ReceiptDto[];
  editedSinceLastApproval: boolean;
};

export type AuditEntryDto = {
  id: string;
  reportId: string;
  actor: UserRefDto;
  actorRoles: Role[];
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  fieldDiffs: AuditFieldDiff[];
  createdAt: string;
};

export type ChangeFeedItemDto =
  | {
      kind: "approval";
      createdAt: string;
      approval: ApprovalActionDto;
      content: null;
    }
  | {
      kind: "content";
      createdAt: string;
      approval: null;
      content: AuditEntryDto;
    };

export function toUserRef(user: Pick<User, "id" | "fullName" | "roles">): UserRefDto {
  return { id: user.id, fullName: user.fullName, roles: user.roles };
}

export function toUserDto(
  user: User,
  department: Department | null,
  manager: User | null,
): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    title: user.title ?? null,
    roles: user.roles,
    isAlsoEmployee: user.isAlsoEmployee,
    isActive: user.isActive,
    departmentId: department?.id ?? null,
    departmentName: department?.name ?? null,
    managerId: manager?.id ?? null,
    managerName: manager?.fullName ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toLineItemDto(
  line: LineItem,
  receiptCount = 0,
): LineItemDto {
  return {
    id: line.id,
    reportId: line.reportId,
    occurredOn: line.occurredOn,
    merchant: line.merchant,
    description: line.description,
    category: line.category,
    amount: line.amount,
    paymentMethod: line.paymentMethod,
    needsReview: line.needsReview,
    receiptCount,
    createdAt: line.createdAt.toISOString(),
  };
}

export function toReceiptDto(receipt: Receipt): ReceiptDto {
  return {
    id: receipt.id,
    reportId: receipt.reportId ?? null,
    lineItemId: receipt.lineItemId ?? null,
    objectPath: receipt.objectPath,
    filename: receipt.filename,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    uploadedById: receipt.uploadedById,
    createdAt: receipt.createdAt.toISOString(),
  };
}

export function toAuditEntryDto(entry: AuditEntry, actor: UserRefDto): AuditEntryDto {
  return {
    id: entry.id,
    reportId: entry.reportId,
    actor,
    actorRoles: entry.actorRoles,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    // jsonb is stored as `unknown`; the schema and recordAudit guarantee
    // it's an array of {field,before,after}.
    fieldDiffs: (entry.fieldDiffs as AuditFieldDiff[] | null) ?? [],
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toApprovalActionDto(
  action: ApprovalAction,
  actor: User,
): ApprovalActionDto {
  return {
    id: action.id,
    reportId: action.reportId,
    actor: toUserRef(actor),
    actorRoles: action.actorRoles,
    fromStatus: action.fromStatus,
    toStatus: action.toStatus,
    comment: action.comment,
    metadata: action.metadata,
    sequence: action.sequence,
    createdAt: action.createdAt.toISOString(),
  };
}

export function formatPeriod(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  const fmt = (iso: string): string => {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  return fmt((start ?? end) as string);
}

export function ageInDays(submittedAt: Date | null, createdAt: Date): number {
  const ref = submittedAt ?? createdAt;
  const ms = Date.now() - ref.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export type ReportRollup = {
  total: string;
  lineCount: number;
  receiptCount: number;
  needsReceipt: boolean;
};

export function rollupTotals(
  lines: LineItem[],
  receiptsByLine: Map<string | null, number>,
): ReportRollup {
  const totalCents = lines.reduce(
    (acc, line) => acc + Math.round(parseFloat(line.amount) * 100),
    0,
  );
  const total = (totalCents / 100).toFixed(2);
  const reportLevel = receiptsByLine.get(null) ?? 0;
  const receiptCount = lines.reduce(
    (acc, line) => acc + (receiptsByLine.get(line.id) ?? 0),
    reportLevel,
  );
  // Receipt is required for any line >= $25 unless paymentMethod is Cash with
  // override; we keep the simple "any line missing receipt > $25" heuristic.
  const needsReceipt = lines.some((line) => {
    const amt = parseFloat(line.amount);
    const hasReceipt = (receiptsByLine.get(line.id) ?? 0) > 0;
    return amt >= 25 && !hasReceipt;
  });
  return {
    total,
    lineCount: lines.length,
    receiptCount,
    needsReceipt,
  };
}

export function toGlMappingDto(mapping: GlMapping): {
  id: string;
  code: string;
  qboAccount: string;
  qboAccountId: string | null;
  active: boolean;
} {
  return {
    id: mapping.id,
    code: mapping.code,
    qboAccount: mapping.qboAccount,
    qboAccountId: mapping.qboAccountId,
    active: mapping.active,
  };
}

export function toPolicyRuleDto(rule: PolicyRule): {
  name: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
} {
  return {
    name: rule.name,
    value: rule.value,
    description: rule.description,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toQboConnectionDto(conn: QboConnection): {
  status: QboConnection["status"];
  realmId: string | null;
  companyName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
} {
  return {
    status: conn.status,
    realmId: conn.realmId ?? null,
    companyName: conn.companyName ?? null,
    connectedAt: conn.connectedAt?.toISOString() ?? null,
    lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    lastSyncError: conn.lastSyncError ?? null,
  };
}

export type PayrollBatchItemDto = {
  id: string;
  reportId: string;
  report: ExpenseReportSummaryDto;
  amount: string;
};

export type ReconciliationRecordDto = {
  id: string;
  reportId: string;
  expectedAmount: string;
  paidAmount: string;
  variance: string;
  flag: ReconciliationRecord["flag"];
  note: string | null;
  createdAt: string;
};

export type PayrollBatchDto = {
  id: string;
  label: string;
  status: PayrollBatch["status"];
  total: string;
  paidAt: string | null;
  reconciledAt: string | null;
  createdAt: string;
  items: PayrollBatchItemDto[];
  reconciliation: ReconciliationRecordDto[];
};

export function toReconciliationDto(
  record: ReconciliationRecord,
): ReconciliationRecordDto {
  return {
    id: record.id,
    reportId: record.reportId,
    expectedAmount: record.expectedAmount,
    paidAmount: record.paidAmount,
    variance: record.variance,
    flag: record.flag,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}
