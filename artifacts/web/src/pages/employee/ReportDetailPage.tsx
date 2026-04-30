import { useState } from "react";
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
  useGetReportTimeline,
  getGetReportTimelineQueryKey
} from "@workspace/api-client-react";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";
import { StatusPill } from "@/components/brand/StatusPill";
import { StatusTracker } from "@/components/brand/StatusTracker";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, PlusCircle, Paperclip, Send, ArrowLeftCircle } from "lucide-react";

export function ReportDetailPage({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

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

  const handleSubmit = () => {
    submitReport.mutate({ id }, {
      onSuccess: (updated) => {
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
        notifySuccess("Report submitted for approval", updated?.displayCode);
      }
    });
  };

  const handleRecall = () => {
    recallReport.mutate({ id }, {
      onSuccess: (updated) => {
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
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

  if (reportLoading || !report) {
    return <div className="p-8 text-center text-[var(--ht-ink-3)]">Loading report details...</div>;
  }

  const isEditable = report.status === "Draft" || report.status === "Changes Requested";
  const canRecall = report.status === "Submitted" || report.status === "Manager Review";

  return (
    <div className="space-y-6 pb-24" data-testid="page-reportdetail">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-[var(--ht-ink-3)]">{report.displayCode}</span>
            <StatusPill status={report.status} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ht-ink)]">
            {report.title}
          </h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <HtCard>
            <div className="flex items-center justify-between p-4 border-b border-[var(--ht-border)]">
              <h2 className="font-medium text-[var(--ht-ink)]">Line Items</h2>
              {isEditable && (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[var(--ht-ink-3)] h-24">
                      No line items added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{formatDate(item.occurredOn)}</TableCell>
                      <TableCell className="font-medium">{item.merchant}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)]">{item.category || "Uncategorized"}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] text-xs">{item.paymentMethod}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(item.amount))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </HtCard>

          <HtCard>
            <div className="flex items-center justify-between p-4 border-b border-[var(--ht-border)]">
              <h2 className="font-medium text-[var(--ht-ink)]">Receipts</h2>
              {isEditable && (
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
            <HtCardHeader title="Audit Log" subtitle={`${timeline.length} action${timeline.length === 1 ? "" : "s"} on this report`} />
            <div className="p-4 space-y-4" data-testid="report-audit-log">
              {timeline.length === 0 ? (
                <div className="text-sm text-[var(--ht-ink-3)]">No activity yet.</div>
              ) : (
                timeline.map((event, i) => (
                  <div key={event.id ?? i} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-[var(--ht-navy)] mt-1.5" />
                      {i < timeline.length - 1 && <div className="w-px h-full bg-[var(--ht-border)] mt-1 mb-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="font-medium text-[var(--ht-ink)]">
                        {event.fromStatus} → {event.toStatus}
                      </div>
                      <div className="text-xs text-[var(--ht-ink-3)] mt-0.5">
                        {event.actor?.fullName}
                        {event.actorRole && (
                          <span className="ml-1 inline-block px-1.5 py-px rounded bg-gray-100 text-[var(--ht-ink-2)] uppercase tracking-wide text-[10px]">
                            {event.actorRole}
                          </span>
                        )}
                        <span className="mx-1">•</span>
                        {formatDateTime(event.createdAt)}
                      </div>
                      {event.comment && (
                        <div className="mt-1 text-[var(--ht-ink-2)] bg-gray-50 p-2 rounded border border-[var(--ht-border)]">
                          {event.comment}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </HtCard>
        </div>
      </div>

      {/* Action Footer */}
      {(isEditable || canRecall) && (
        <div className="fixed bottom-0 left-64 right-0 p-4 bg-white border-t border-[var(--ht-border)] flex items-center justify-between z-10 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--ht-ink)]">
              {isEditable ? "Draft Report" : "Report Submitted"}
            </p>
            <p className="text-xs text-[var(--ht-ink-3)]">
              {isEditable ? "Add line items and receipts, then submit for approval." : "Waiting for manager review."}
            </p>
          </div>
          <div className="flex gap-3">
            {isEditable && (
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
    </div>
  );
}
