import { Link } from "wouter";
import { formatMoney, formatDate, formatRelative } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard } from "@/components/brand/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useManagerQueue, getManagerQueueQueryKey } from "@workspace/api-client-react";
import { Clock } from "lucide-react";

export function ManagerQueuePage() {
  const { data: reports, isLoading } = useManagerQueue({
    query: { queryKey: getManagerQueueQueryKey() }
  });

  return (
    <div className="space-y-6" data-testid="page-managerqueue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Manager Queue
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Reports from your team awaiting your review.
          </p>
        </div>
      </div>

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading queue...</div>
        ) : !reports || reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            You're all caught up! No reports in your queue.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Submitted</TableHead>
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
                      href={`/manager/queue/${report.id}`}
                      className="font-medium text-[var(--ht-primary)] hover:underline"
                    >
                      {report.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {report.employee?.fullName}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--ht-ink-3)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelative(report.updatedAt)}
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
