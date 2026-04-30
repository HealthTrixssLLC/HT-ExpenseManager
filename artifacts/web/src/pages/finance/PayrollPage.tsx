import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePayrollQueue,
  getPayrollQueueQueryKey,
  useListPayrollBatches,
  getListPayrollBatchesQueryKey,
  useCreatePayrollBatch,
  useMarkPayrollBatchPaid
} from "@workspace/api-client-react";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { notifySuccess } from "@/lib/notify";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle } from "lucide-react";

export function PayrollPage() {
  const qc = useQueryClient();
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("queue");

  const { data: queue = [], isLoading: queueLoading } = usePayrollQueue({
    query: { queryKey: getPayrollQueueQueryKey() }
  });

  const { data: batches = [], isLoading: batchesLoading } = useListPayrollBatches({
    query: { queryKey: getListPayrollBatchesQueryKey() }
  });

  const createBatch = useCreatePayrollBatch();
  const markPaid = useMarkPayrollBatchPaid();

  const handleCreateBatch = () => {
    if (queue.length === 0) return;
    createBatch.mutate({ data: { label: `Batch ${new Date().toISOString().split('T')[0]}` } }, {
      onSuccess: (batch) => {
        setSelectedReports([]);
        qc.invalidateQueries({ queryKey: getPayrollQueueQueryKey() });
        qc.invalidateQueries({ queryKey: getListPayrollBatchesQueryKey() });
        setActiveTab("batches");
        notifySuccess("Batch created", `${batch.label} • ${formatMoney(Number(batch.total))}`);
      }
    });
  };

  const handleMarkPaid = (batchId: string) => {
    markPaid.mutate({ id: batchId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPayrollBatchesQueryKey() });
        notifySuccess("Marked paid", "Batch is ready to reconcile.");
      }
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReports(queue.map(r => r.id));
    } else {
      setSelectedReports([]);
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedReports(prev => [...prev, id]);
    } else {
      setSelectedReports(prev => prev.filter(x => x !== id));
    }
  };

  const totalSelectedAmount = queue
    .filter(r => selectedReports.includes(r.id))
    .reduce((sum, r) => sum + Number(r.total), 0);
  const queueTotalAmount = queue.reduce((sum, r) => sum + Number(r.total), 0);
  void totalSelectedAmount;

  return (
    <div className="space-y-6" data-testid="page-payroll">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Payroll Reimbursement
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Batch approved reports and mark them as paid.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue">Ready for Payroll ({queue.length})</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>
        
        <TabsContent value="queue" className="mt-6 space-y-4">
          <div className="flex items-center justify-between bg-white p-4 border border-[var(--ht-border)] rounded-md shadow-sm">
            <div className="text-sm text-[var(--ht-ink-2)]">
              <span className="font-medium text-[var(--ht-ink)]">{queue.length}</span> reports in queue
              ({formatMoney(queueTotalAmount)})
              <div className="text-xs text-[var(--ht-ink-3)] mt-1">
                Creating a batch sweeps the entire queue.
              </div>
            </div>
            <Button 
              onClick={handleCreateBatch} 
              disabled={queue.length === 0 || createBatch.isPending}
            >
              {createBatch.isPending ? "Creating..." : "Create Payroll Batch"}
            </Button>
          </div>

          <HtCard>
            {queueLoading ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading queue...</div>
            ) : queue.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
                No reports ready for payroll.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={selectedReports.length === queue.length && queue.length > 0}
                        onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Report</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Approved On</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedReports.includes(report.id)}
                          onCheckedChange={(checked) => toggleSelect(report.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {report.employee?.fullName}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/finance/queue/${report.id}`}
                          className="text-[var(--ht-primary)] hover:underline"
                        >
                          {report.title}
                        </Link>
                        <div className="text-xs font-mono text-[var(--ht-ink-3)]">{report.displayCode}</div>
                      </TableCell>
                      <TableCell className="text-[var(--ht-ink-2)]">{report.departmentName}</TableCell>
                      <TableCell className="text-sm text-[var(--ht-ink-3)]">
                        {formatDate(report.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(Number(report.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </HtCard>
        </TabsContent>

        <TabsContent value="batches" className="mt-6">
          <HtCard>
            {batchesLoading ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading batches...</div>
            ) : batches.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
                No payroll batches created yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-sm">{batch.id}</TableCell>
                      <TableCell className="text-sm text-[var(--ht-ink-2)]">
                        {formatDateTime(batch.createdAt)}
                      </TableCell>
                      <TableCell>{batch.items.length}</TableCell>
                      <TableCell>
                        {batch.paidAt ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Paid {formatDate(batch.paidAt)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending Payment
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(Number(batch.total))}
                      </TableCell>
                      <TableCell className="text-right">
                        {!batch.paidAt ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleMarkPaid(batch.id)}
                            disabled={markPaid.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Paid
                          </Button>
                        ) : (
                          <Link href={`/finance/reconciliation?batch=${batch.id}`}>
                            <Button variant="link" size="sm">Reconcile</Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </HtCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
