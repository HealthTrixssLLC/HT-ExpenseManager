import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport,
  getGetReportQueryKey,
  getFinanceQueueQueryKey,
  useListLineItems,
  getListLineItemsQueryKey,
  useListReceipts,
  getListReceiptsQueryKey,
  useFinanceApprove,
  useFinanceReject,
  usePostToQuickbooks,
  useRetryQuickbooksPost,
  useGetGlPreview,
  getGetGlPreviewQueryKey,
  type PostToQuickbooksResponse,
} from "@workspace/api-client-react";
import { notifySuccess } from "@/lib/notify";
import { formatMoney, formatDate } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { StatusTracker } from "@/components/brand/StatusTracker";
import { HtCard, HtCardHeader, HtSection } from "@/components/brand/Card";
import { ReceiptThumb } from "@/components/brand/ReceiptThumb";
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
import { AlertCircle, CheckCircle, UploadCloud, XCircle } from "lucide-react";

export function FinanceReviewPage({ id }: { id: string }) {
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
  const { data: glPreview, isLoading: glLoading } = useGetGlPreview(id, {
    query: { queryKey: getGetGlPreviewQueryKey(id), enabled: !!id && (report?.status === "Finance Review" || report?.status === "Finance Approved" || report?.status === "Posted to QuickBooks" || report?.status === "Ready for Payroll Reimbursement" || report?.status === "Sync Error") }
  });

  const approve = useFinanceApprove();
  const reject = useFinanceReject();
  const postQbo = usePostToQuickbooks();
  const retryQbo = useRetryQuickbooksPost();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [postResult, setPostResult] = useState<PostToQuickbooksResponse | null>(null);

  const handleApprove = () => {
    approve.mutate({ id, data: { comment: "" } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getFinanceQueueQueryKey() });
        notifySuccess("Finance approved", `${report?.displayCode ?? "Report"} is ready to post.`);
      }
    });
  };

  const handleReject = () => {
    reject.mutate({ id, data: { comment: rejectNotes } }, {
      onSuccess: () => {
        setRejectOpen(false);
        setRejectNotes("");
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getFinanceQueueQueryKey() });
        notifySuccess("Report rejected", "The employee will be notified.");
      }
    });
  };

  const handlePost = () => {
    postQbo.mutate({ id, data: { comment: "" } }, {
      onSuccess: (resp) => {
        setPostResult(resp);
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getFinanceQueueQueryKey() });
        if (resp.status === "posted") {
          notifySuccess("Posted to QuickBooks", resp.journalId ? `Journal ${resp.journalId}` : undefined);
        }
      }
    });
  };

  const handleRetry = () => {
    retryQbo.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
        qc.invalidateQueries({ queryKey: getFinanceQueueQueryKey() });
        notifySuccess("Retry sent");
      }
    });
  };

  if (reportLoading || !report) {
    return <div className="p-8 text-center text-[var(--ht-ink-3)]">Loading report details...</div>;
  }

  const canApprove = report.status === "Finance Review" || report.status === "Manager Approved";
  const canPost = report.status === "Finance Approved";
  const canRetry = report.status === "Sync Error";

  return (
    <div className="space-y-6 pb-24" data-testid="page-financereview">
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
            {report.employee?.fullName} • {report.periodStart && report.periodEnd
              ? `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
              : "-"}
          </p>
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
            <HtCardHeader title="Line Items" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-[var(--ht-ink-3)] h-24">
                      No line items.
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{formatDate(item.occurredOn)}</TableCell>
                      <TableCell className="font-medium">{item.merchant}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)]">{item.category || "Uncategorized"}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(item.amount))}</TableCell>
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

          {(canApprove || canPost || glPreview) && (
            <HtCard>
              <HtCardHeader title="GL Preview" />
              <div className="p-4">
                {glLoading ? (
                  <div className="text-sm text-[var(--ht-ink-3)]">Loading preview...</div>
                ) : glPreview ? (
                  <div className="space-y-4">
                    {glPreview.debits.map((l, i) => (
                      <div key={`d-${i}`} className="flex justify-between text-sm">
                        <div>
                          <div className="font-medium">{l.account}</div>
                          <div className="text-xs text-[var(--ht-ink-3)]">{l.category}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatMoney(Number(l.amount))}</div>
                          <div className="text-xs text-[var(--ht-ink-3)]">Debit</div>
                        </div>
                      </div>
                    ))}
                    {glPreview.credits.map((l, i) => (
                      <div key={`c-${i}`} className="flex justify-between text-sm">
                        <div>
                          <div className="font-medium">{l.account}</div>
                          <div className="text-xs text-[var(--ht-ink-3)]">{l.category}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatMoney(Number(l.amount))}</div>
                          <div className="text-xs text-[var(--ht-ink-3)]">Credit</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--ht-ink-3)]">GL preview not available yet.</div>
                )}
              </div>
            </HtCard>
          )}
        </div>
      </div>

      {/* Action Footer */}
      {(canApprove || canPost || canRetry) && (
        <div className="fixed bottom-0 left-64 right-0 p-4 bg-white border-t border-[var(--ht-border)] flex items-center justify-between z-10 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--ht-ink)]">Finance Review</p>
            <p className="text-xs text-[var(--ht-ink-3)]">Review and post to accounting.</p>
          </div>
          <div className="flex gap-3">
            {canApprove && (
              <>
                <Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button>
                <Button data-testid="button-approve" onClick={handleApprove} disabled={approve.isPending}>
                  {approve.isPending ? "Approving..." : "Finance Approve"}
                </Button>
              </>
            )}
            {canPost && (
              <Button
                data-testid="button-post-quickbooks"
                onClick={() => setPostConfirmOpen(true)}
                disabled={postQbo.isPending}
                className="bg-[var(--ht-orange)] hover:bg-[var(--ht-orange-1)]"
              >
                <UploadCloud className="w-4 h-4 mr-2" />
                {postQbo.isPending ? "Posting..." : "Post to QuickBooks"}
              </Button>
            )}
            {canRetry && (
              <Button onClick={handleRetry} disabled={retryQbo.isPending} variant="destructive">
                <AlertCircle className="w-4 h-4 mr-2" />
                {retryQbo.isPending ? "Retrying..." : "Retry QBO Sync"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Post to QuickBooks Confirmation Dialog */}
      <Dialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
        <DialogContent data-testid="dialog-post-confirm">
          <DialogHeader>
            <DialogTitle>Post to QuickBooks?</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3 text-sm text-[var(--ht-ink-2)]">
            <p>
              You're about to post <span className="font-medium text-[var(--ht-ink)]">{report.displayCode}</span> ({formatMoney(Number(report.total))}) to QuickBooks Online. This creates a journal entry that cannot be reversed from this screen.
            </p>
            {glPreview && (
              <div className="bg-gray-50 border border-[var(--ht-border)] rounded-md p-3">
                <div className="text-xs text-[var(--ht-ink-3)] mb-1">Posting summary</div>
                <div className="flex justify-between text-xs"><span>Debits</span><span className="font-medium">{formatMoney(Number(glPreview.totalDebits))}</span></div>
                <div className="flex justify-between text-xs"><span>Credits</span><span className="font-medium">{formatMoney(Number(glPreview.totalCredits))}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostConfirmOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-post-confirm"
              onClick={() => { setPostConfirmOpen(false); handlePost(); }}
              disabled={postQbo.isPending}
              className="bg-[var(--ht-orange)] hover:bg-[var(--ht-orange-1)]"
            >
              {postQbo.isPending ? "Posting..." : "Confirm & Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Result Dialog */}
      <Dialog open={!!postResult} onOpenChange={(o) => { if (!o) setPostResult(null); }}>
        <DialogContent data-testid="dialog-post-result">
          <DialogHeader>
            <DialogTitle>
              {postResult?.status === "posted" ? "Posted to QuickBooks" : "Sync Error"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3 text-sm">
            {postResult?.status === "posted" ? (
              <>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                  <span>Journal entry created successfully.</span>
                </div>
                {postResult.journalId && (
                  <div className="bg-gray-50 border border-[var(--ht-border)] rounded-md p-3 font-mono text-xs">
                    Journal ID: {postResult.journalId}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-5 h-5" />
                  <span>QuickBooks rejected this posting.</span>
                </div>
                {postResult?.errorMessage && (
                  <div className="bg-red-50 border border-red-100 rounded-md p-3 text-red-800 text-xs">
                    {postResult.errorMessage}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPostResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Report</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-[var(--ht-ink-2)]">
              Rejecting this report will send it back to the employee. Please provide a reason.
            </p>
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectNotes.trim() || reject.isPending}>
              {reject.isPending ? "Rejecting..." : "Reject Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
