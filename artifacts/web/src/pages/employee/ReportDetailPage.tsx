import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport,
  getGetReportQueryKey,
  useListLineItems,
  getListLineItemsQueryKey,
  useListReceipts,
  getListReceiptsQueryKey,
  useSubmitReport,
  useRecallReport,
  useDeleteReport,
  useDeleteLineItem,
  useGetReportTimeline,
  getGetReportTimelineQueryKey,
  type LineItem,
} from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";
import { useAuth } from "@/lib/auth-context";
import { canEditReportClient } from "@/lib/edit-permissions";
import { StatusPill } from "@/components/brand/StatusPill";
import { StatusTracker } from "@/components/brand/StatusTracker";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
import { ChangeFeed } from "@/components/ChangeFeed";
import { EditReportHeaderDialog } from "@/components/EditReportHeaderDialog";
import { EditLineItemDialog } from "@/components/EditLineItemDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trash2,
  PlusCircle,
  Paperclip,
  Send,
  ArrowLeftCircle,
  Pencil,
  AlertTriangle,
} from "lucide-react";

export function ReportDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, roles } = useAuth();

  const { data: report, isLoading: reportLoading } = useGetReport(id, {
    query: { queryKey: getGetReportQueryKey(id), enabled: !!id }
  });

  const { data: lineItems = [] } = useListLineItems(id, {
    query: { queryKey: getListLineItemsQueryKey(id), enabled: !!id }
  });

  const { data: receipts = [] } = useListReceipts(id, {
    query: { queryKey: getListReceiptsQueryKey(id), enabled: !!id }
  });

  const { data: timeline = [] } = useGetReportTimeline(id, {
    query: { queryKey: getGetReportTimelineQueryKey(id), enabled: !!id }
  });

  const submitReport = useSubmitReport();
  const recallReport = useRecallReport();
  const deleteReport = useDeleteReport();
  const deleteLineItem = useDeleteLineItem();

  const [editHeaderOpen, setEditHeaderOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);

  const invalidateReportData = () => {
    qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
  };

  const handleSubmit = () => {
    submitReport.mutate({ id }, {
      onSuccess: (updated) => {
        invalidateReportData();
        notifySuccess("Report submitted for approval", updated?.displayCode);
      }
    });
  };

  const handleRecall = () => {
    recallReport.mutate({ id }, {
      onSuccess: (updated) => {
        invalidateReportData();
        notifySuccess("Report recalled to draft", updated?.displayCode);
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this report? This cannot be undone.")) {
      const code = report?.displayCode;
      deleteReport.mutate({ id }, {
        onSuccess: () => {
          notifySuccess("Report deleted", code);
          setLocation("/my-reports");
        }
      });
    }
  };

  const handleDeleteLineItem = (lineId: string, merchant: string) => {
    if (confirm(`Remove "${merchant}" from this report?`)) {
      deleteLineItem.mutate({ lineId }, {
        onSuccess: () => {
          invalidateReportData();
          notifySuccess("Line item removed", merchant);
        }
      });
    }
  };

  const canEdit = useMemo(
    () => (report ? canEditReportClient(report, user, roles) : false),
    [report, user, roles],
  );

  // Owner-only affordances (delete the whole report, submit for approval).
  // Managers / delegates can edit content but never destroy or submit.
  const isOwner = !!user && !!report && report.employee.id === user.id;

  if (reportLoading || !report) {
    return <div className="p-8 text-center text-[var(--ht-ink-3)]">Loading report details...</div>;
  }

  const canRecall = isOwner && (report.status === "Submitted" || report.status === "Manager Review");
  const canSubmit = isOwner && (report.status === "Draft" || report.status === "Changes Requested");
  const showFooter = canEdit || canRecall || canSubmit;

  return (
    <div className="space-y-6 pb-24" data-testid="page-reportdetail">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-[var(--ht-ink-3)]">{report.displayCode}</span>
            <StatusPill status={report.status} />
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--ht-ink)]">
              {report.title}
            </h1>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditHeaderOpen(true)}
                data-testid="button-edit-header"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
          <p className="mt-1 text-[var(--ht-ink-2)]">
            {report.periodStart && report.periodEnd
              ? `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
              : "-"}
            {report.departmentName && ` • ${report.departmentName}`}
          </p>
          {report.description && (
            <p className="mt-4 text-sm text-[var(--ht-ink-2)] max-w-2xl">
              {report.description}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tracking-tight text-[var(--ht-ink)]">
            {formatMoney(Number(report.total))}
          </div>
          <div className="text-sm text-[var(--ht-ink-3)] mt-1">Total Amount</div>
        </div>
      </div>

      {report.editedSinceLastApproval && (
        <div
          className="flex items-start gap-3 p-3 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900"
          data-testid="banner-edited-since-approval"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-px text-amber-600" />
          <div>
            <p className="font-medium">Edited since last approval</p>
            <p className="text-amber-800">
              This report has been modified after the last workflow action. Review the audit log below for details.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <HtCard>
            <div className="flex items-center justify-between p-4 border-b border-[var(--ht-border)]">
              <h2 className="font-medium text-[var(--ht-ink)]">Line Items</h2>
              {canEdit && (
                <Link href={`/reports/${report.id}/lines/new`}>
                  <Button variant="outline" size="sm">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Add Line Item
                  </Button>
                </Link>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canEdit && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-[var(--ht-ink-3)] h-24">
                      No line items added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map(item => (
                    <TableRow key={item.id} data-testid={`line-item-row-${item.id}`}>
                      <TableCell className="text-sm">{formatDate(item.occurredOn)}</TableCell>
                      <TableCell className="font-medium">{item.merchant}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)]">{item.category || "Uncategorized"}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] text-xs">{item.paymentMethod}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(item.amount))}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingLineItem(item)}
                              aria-label={`Edit ${item.merchant}`}
                              data-testid={`button-edit-line-item-${item.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLineItem(item.id, item.merchant)}
                              aria-label={`Delete ${item.merchant}`}
                              className="text-red-600 hover:text-red-700"
                              data-testid={`button-delete-line-item-${item.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </HtCard>

          <HtCard>
            <div className="flex items-center justify-between p-4 border-b border-[var(--ht-border)]">
              <h2 className="font-medium text-[var(--ht-ink)]">Receipts</h2>
              {canEdit && (
                <Link href={`/reports/${report.id}/receipts`}>
                  <Button variant="outline" size="sm">
                    <Paperclip className="w-4 h-4 mr-2" />
                    Manage Receipts
                  </Button>
                </Link>
              )}
            </div>
            <div className="p-4 flex flex-wrap gap-4">
              {receipts.length === 0 ? (
                <div className="text-sm text-[var(--ht-ink-3)]">No receipts attached.</div>
              ) : (
                receipts.map(r => (
                  <ReceiptThumb key={r.id} receipt={r} />
                ))
              )}
            </div>
          </HtCard>
        </div>

        <div className="space-y-6">
          <HtCard>
            <HtCardHeader title="Workflow Status" />
            <div className="p-4">
              <StatusTracker current={report.status} />
            </div>
          </HtCard>

          <HtCard>
            <HtCardHeader
              title="Audit Log"
              subtitle={`${timeline.length} event${timeline.length === 1 ? "" : "s"} on this report`}
            />
            <div className="p-4" data-testid="report-audit-log">
              <ChangeFeed items={timeline} />
            </div>
          </HtCard>
        </div>
      </div>

      {/* Action Footer */}
      {showFooter && (
        <div className="fixed bottom-0 left-64 right-0 p-4 bg-white border-t border-[var(--ht-border)] flex items-center justify-between z-10 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--ht-ink)]">
              {canSubmit ? "Draft Report" : canEdit ? "Editable Report" : "Report Submitted"}
            </p>
            <p className="text-xs text-[var(--ht-ink-3)]">
              {canSubmit
                ? "Add line items and receipts, then submit for approval."
                : canEdit
                  ? "Changes are recorded in the audit log and visible to reviewers."
                  : "Waiting for manager review."}
            </p>
          </div>
          <div className="flex gap-3">
            {canSubmit && (
              <>
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDelete} disabled={deleteReport.isPending}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Report
                </Button>
                <Button data-testid="button-submit-report" onClick={handleSubmit} disabled={submitReport.isPending || lineItems.length === 0}>
                  <Send className="w-4 h-4 mr-2" />
                  {submitReport.isPending ? "Submitting..." : "Submit for Approval"}
                </Button>
              </>
            )}
            {canRecall && (
              <Button variant="outline" onClick={handleRecall} disabled={recallReport.isPending}>
                <ArrowLeftCircle className="w-4 h-4 mr-2" />
                {recallReport.isPending ? "Recalling..." : "Recall to Draft"}
              </Button>
            )}
          </div>
        </div>
      )}

      <EditReportHeaderDialog
        report={report}
        open={editHeaderOpen}
        onOpenChange={setEditHeaderOpen}
      />
      {editingLineItem && (
        <EditLineItemDialog
          reportId={id}
          lineItem={editingLineItem}
          open={!!editingLineItem}
          onOpenChange={(open) => !open && setEditingLineItem(null)}
        />
      )}
    </div>
  );
}
