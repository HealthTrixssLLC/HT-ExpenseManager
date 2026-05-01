import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPayrollBatches,
  getListPayrollBatchesQueryKey,
  useGetPayrollBatch,
  getGetPayrollBatchQueryKey,
  useReconcilePayrollBatch
} from "@workspace/api-client-react";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle } from "lucide-react";
import { StatusPill } from "@/components/brand/StatusPill";

export function ReconciliationPage() {
  const qc = useQueryClient();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const initialBatchId = params.get("batch");

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(initialBatchId);
  const [reconciliationData, setReconciliationData] = useState<Record<string, { paidOn: string; amount: string }>>({});

  const { data: batches = [] } = useListPayrollBatches({
    query: { queryKey: getListPayrollBatchesQueryKey() }
  });

  const { data: batch, isLoading: batchLoading } = useGetPayrollBatch(selectedBatchId!, {
    query: { queryKey: getGetPayrollBatchQueryKey(selectedBatchId!), enabled: !!selectedBatchId }
  });

  const reconcile = useReconcilePayrollBatch();

  // Initialize reconciliation form data
  useEffect(() => {
    if (batch?.items) {
      const initialData: Record<string, { paidOn: string; amount: string }> = {};
      const today = new Date().toISOString().split("T")[0];
      
      batch.items.forEach(item => {
        initialData[item.reportId] = {
          paidOn: today,
          amount: item.amount
        };
      });
      setReconciliationData(initialData);
    }
  }, [batch]);

  const handleInputChange = (reportId: string, field: "paidOn" | "amount", value: string) => {
    setReconciliationData(prev => ({
      ...prev,
      [reportId]: {
        ...prev[reportId],
        [field]: value
      }
    }));
  };

  const handleReconcile = () => {
    if (!selectedBatchId) return;

    const entries = Object.entries(reconciliationData).map(([reportId, data]) => ({
      reportId,
      paidAmount: data.amount,
      note: data.paidOn ? `Paid on ${data.paidOn}` : undefined,
    }));

    reconcile.mutate({
      id: selectedBatchId,
      data: { entries }
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPayrollBatchQueryKey(selectedBatchId) });
        qc.invalidateQueries({ queryKey: getListPayrollBatchesQueryKey() });
        notifySuccess("Reconciled", `${entries.length} entr${entries.length === 1 ? "y" : "ies"} recorded.`);
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="page-reconciliation">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Payroll Reconciliation
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Confirm actual paid amounts and dates from the payroll provider.
          </p>
        </div>
        <HelpLink topicId="reconcile" />
      </div>

      <div className="flex items-center gap-4 max-w-md">
        <Label htmlFor="batch-select" className="w-24">Select Batch:</Label>
        <Select 
          value={selectedBatchId || ""} 
          onValueChange={setSelectedBatchId}
        >
          <SelectTrigger id="batch-select">
            <SelectValue placeholder="Select a batch" />
          </SelectTrigger>
          <SelectContent>
            {batches.map(b => (
              <SelectItem key={b.id} value={b.id}>
                {b.id.substring(0, 8)}... - {formatDate(b.createdAt)} - {formatMoney(Number(b.total))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedBatchId && (
        <HtCard>
          <HtCardHeader title="Batch Reports" />
          {batchLoading ? (
            <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading batch details...</div>
          ) : !batch ? (
            <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Batch not found.</div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Report</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Approved Amount</TableHead>
                    <TableHead className="w-40">Paid On</TableHead>
                    <TableHead className="w-32">Actual Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.items?.map(item => {
                    const isReconciled = item.report.status === "Reconciled";
                    
                    return (
                      <TableRow key={item.report.id}>
                        <TableCell className="font-medium">
                          {item.report.employee?.fullName}
                        </TableCell>
                        <TableCell>
                          <Link href={`/finance/queue/${item.report.id}`} className="text-[var(--ht-primary)] hover:underline">
                            {item.report.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusPill status={item.report.status} />
                        </TableCell>
                        <TableCell className="text-right text-[var(--ht-ink-2)]">
                          {formatMoney(Number(item.amount))}
                        </TableCell>
                        <TableCell>
                          {isReconciled ? (
                            <span className="text-sm">{item.report.period ? formatDate(item.report.period) : "-"}</span>
                          ) : (
                            <Input
                              type="date"
                              value={reconciliationData[item.report.id]?.paidOn || ""}
                              onChange={e => handleInputChange(item.report.id, "paidOn", e.target.value)}
                              className="h-8"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {isReconciled ? (
                            <span className="text-sm font-medium">{formatMoney(Number(item.amount))}</span>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              value={reconciliationData[item.report.id]?.amount || ""}
                              onChange={e => handleInputChange(item.report.id, "amount", e.target.value)}
                              className="h-8"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              
              {batch.paidAt && !batch.reconciledAt && batch.items?.some(item => item.report.status !== "Reconciled") && (
                <div className="p-4 border-t border-[var(--ht-border)] flex justify-end">
                  <Button 
                    onClick={handleReconcile}
                    disabled={reconcile.isPending}
                    className="bg-[var(--ht-orange)] hover:bg-[var(--ht-orange-1)]"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {reconcile.isPending ? "Reconciling..." : "Submit Reconciliation"}
                  </Button>
                </div>
              )}
              {!batch.paidAt && (
                <div className="p-4 border-t border-[var(--ht-border)] text-sm text-[var(--ht-ink-3)]">
                  Mark this batch as Paid (on the Payroll page) before reconciling.
                </div>
              )}
            </div>
          )}
        </HtCard>
      )}
    </div>
  );
}
