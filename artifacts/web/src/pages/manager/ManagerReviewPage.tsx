import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport,
  getGetReportQueryKey,
  getManagerQueueQueryKey,
  useListLineItems,
  getListLineItemsQueryKey,
  useListReceipts,
  getListReceiptsQueryKey,
  useGetReportTimeline,
  getGetReportTimelineQueryKey,
  useManagerApprove,
  useManagerReject,
  useManagerRequestChanges,
} from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";
import { StatusPill } from "@/components/brand/StatusPill";
import { StatusTracker } from "@/components/brand/StatusTracker";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
import { ChangeFeed } from "@/components/ChangeFeed";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Paperclip } from "lucide-react";

export function ManagerReviewPage({ id }: { id: string }) {
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

  const approve = useManagerApprove();
  const reject = useManagerReject();
  const requestChanges = useManagerRequestChanges();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [comments, setComments] = useState("");

  const handleApprove = () => {
    approve.mutate({ id, data: { comment: "" } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) }); qc.invalidateQueries({ queryKey: getManagerQueueQueryKey() });
        notifySuccess("Approved", `${report?.displayCode ?? "Report"} sent to Finance.`);
        setLocation("/manager/queue");
      }
    });
  };

  const handleReject = () => {
    reject.mutate({ id, data: { comment: comments } }, {
      onSuccess: () => {
        setRejectOpen(false);
        setComments("");
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) }); qc.invalidateQueries({ queryKey: getManagerQueueQueryKey() });
        notifySuccess("Rejected", "The employee will be notified.");
        setLocation("/manager/queue");
      }
    });
  };

  const handleRequestChanges = () => {
    requestChanges.mutate({ id, data: { comment: comments } }, {
      onSuccess: () => {
        setChangesOpen(false);
        setComments("");
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) }); qc.invalidateQueries({ queryKey: getManagerQueueQueryKey() });
        notifySuccess("Changes requested", "Sent back to the employee.");
        setLocation("/manager/queue");
      }
    });
  };

  if (reportLoading || !report) {
    return <div className="p-8 text-center text-[var(--ht-ink-3)]">Loading report details...</div>;
  }

  const canReview = report.status === "Manager Review" || report.status === "Submitted";

  return (
    <div className="space-y-6 pb-24" data-testid="page-managerreview">
      {/* Header */}
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
            {report.employee?.fullName} • {report.periodStart ? formatDate(report.periodStart) : "-"} - {report.periodEnd ? formatDate(report.periodEnd) : "-"}
          </p>
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
              The owner or another approver edited this report after the last workflow action. Confirm the change history before approving.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <HtCard>
            <HtCardHeader title="Line Items" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[var(--ht-ink-3)] h-24">
                      No line items.
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map(item => (
                    <TableRow key={item.id} data-testid={`review-line-item-${item.id}`}>
                      <TableCell className="text-sm align-top">{formatDate(item.occurredOn)}</TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{item.merchant}</div>
                        {item.description ? (
                          <div className="mt-1 text-xs text-[var(--ht-ink-3)] whitespace-pre-wrap">
                            {item.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] align-top">
                        {item.category || "Uncategorized"}
                      </TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] text-xs align-top">
                        {item.paymentMethod}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {item.needsReview && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-xs font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              Policy review
                            </span>
                          )}
                          {item.receiptCount === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium">
                              <Paperclip className="w-3 h-3" />
                              Missing receipt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium">
                              <Paperclip className="w-3 h-3" />
                              {item.receiptCount} receipt{item.receiptCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium align-top">
                        {formatMoney(Number(item.amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </HtCard>

          <HtCard>
            <HtCardHeader title="Receipts" />
            <div className="p-4 flex flex-wrap gap-4">
              {receipts.length === 0 ? (
                <div className="text-sm text-[var(--ht-ink-3)]">No receipts attached.</div>
              ) : (
                receipts.map(r => (
                  <ReceiptThumb key={r.id} receipt={r} size={96} showCaption captionWidth={140} />
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
      {canReview && (
        <div className="fixed bottom-0 left-64 right-0 p-4 bg-white border-t border-[var(--ht-border)] flex items-center justify-between z-10 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--ht-ink)]">Manager Review</p>
            <p className="text-xs text-[var(--ht-ink-3)]">Review and approve expenses.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setComments(""); setRejectOpen(true); }}>
              Reject
            </Button>
            <Button variant="outline" onClick={() => { setComments(""); setChangesOpen(true); }}>
              Request Changes
            </Button>
            <Button data-testid="button-approve" onClick={handleApprove} disabled={approve.isPending}>
              {approve.isPending ? "Approving..." : "Approve Report"}
            </Button>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Report</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-[var(--ht-ink-2)]">
              Rejecting this report will send it back to the employee and end the current workflow. Please provide a reason.
            </p>
            <Textarea
              placeholder="Reason for rejection..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!comments.trim() || reject.isPending}>
              {reject.isPending ? "Rejecting..." : "Reject Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Dialog */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-[var(--ht-ink-2)]">
              Send this report back to the employee for modifications. Please provide details on what needs to be changed.
            </p>
            <Textarea
              placeholder="What needs to be changed?"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangesOpen(false)}>Cancel</Button>
            <Button onClick={handleRequestChanges} disabled={!comments.trim() || requestChanges.isPending}>
              {requestChanges.isPending ? "Sending..." : "Request Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
