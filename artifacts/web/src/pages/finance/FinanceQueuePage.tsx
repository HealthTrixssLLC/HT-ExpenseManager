import { Link } from "wouter";
import { formatMoney, formatDate } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard, HtCardHeader, HtSection } from "@/components/brand/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFinanceQueue, getFinanceQueueQueryKey } from "@workspace/api-client-react";

export function FinanceQueuePage() {
  const { data: reports, isLoading } = useFinanceQueue({
    query: { queryKey: getFinanceQueueQueryKey() }
  });

  return (
    <div className="space-y-6" data-testid="page-financequeue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Finance Queue
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Reports awaiting finance approval and accounting sync.
          </p>
        </div>
      </div>

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading queue...</div>
        ) : !reports || reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            No reports in the finance queue.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id} data-testid={`table-row-report-${report.id}`}>
                  <TableCell className="font-mono text-xs">{report.displayCode}</TableCell>
                  <TableCell>
                    <Link
                      href={`/finance/queue/${report.id}`}
                      className="font-medium text-[var(--ht-primary)] hover:underline"
                    >
                      {report.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {report.employee?.fullName}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--ht-ink-3)]">
                    {report.period ? formatDate(report.period) : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={report.status} />
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
    </div>
  );
}
