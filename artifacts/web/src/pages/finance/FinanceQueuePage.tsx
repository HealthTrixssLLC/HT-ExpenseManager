import { useMemo, useState } from "react";
import { Link } from "wouter";
import { formatMoney, formatDate, formatRelative } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFinanceQueue, getFinanceQueueQueryKey } from "@workspace/api-client-react";
import { Clock } from "lucide-react";

type AgeBucket = "all" | "today" | "<3d" | "<7d" | ">7d";

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ageTone(days: number): string {
  if (days <= 0) return "text-emerald-700 bg-emerald-50";
  if (days < 3) return "text-[var(--ht-ink-2)] bg-gray-100";
  if (days < 7) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export function FinanceQueuePage() {
  const { data: reports = [], isLoading } = useFinanceQueue({
    query: { queryKey: getFinanceQueueQueryKey() }
  });

  const [search, setSearch] = useState("");
  const [age, setAge] = useState<AgeBucket>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statuses = useMemo(() => {
    const s = new Set<string>();
    reports.forEach((r) => s.add(r.status));
    return Array.from(s);
  }, [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.displayCode} ${r.employee?.fullName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (age !== "all") {
        const d = ageDays(r.updatedAt);
        if (age === "today" && d > 0) return false;
        if (age === "<3d" && d >= 3) return false;
        if (age === "<7d" && d >= 7) return false;
        if (age === ">7d" && d < 7) return false;
      }
      return true;
    });
  }, [reports, search, age, statusFilter]);

  return (
    <div className="space-y-6" data-testid="page-financequeue">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Finance Queue
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Reports awaiting finance approval and accounting sync.
          </p>
        </div>
        <HelpLink topicId="finance-queue" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee, title, or code…"
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={age} onValueChange={(v) => setAge(v as AgeBucket)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Age" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="<3d">&lt; 3 days</SelectItem>
            <SelectItem value="<7d">&lt; 7 days</SelectItem>
            <SelectItem value=">7d">&gt; 7 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-[var(--ht-ink-3)]">
          Showing <span className="font-medium text-[var(--ht-ink)]">{filtered.length}</span> of {reports.length}
        </div>
      </div>

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading queue...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            No reports in the finance queue.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            No reports match those filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((report) => {
                const days = ageDays(report.updatedAt);
                return (
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
                    <TableCell>{report.employee?.fullName}</TableCell>
                    <TableCell className="text-xs text-[var(--ht-ink-3)]">
                      {report.period ? formatDate(report.period) : "-"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ageTone(days)}`}>
                        <Clock className="w-3 h-3" />
                        {days <= 0 ? "Today" : `${days}d`}
                        <span className="text-[10px] text-[var(--ht-ink-3)] ml-1">
                          {formatRelative(report.updatedAt)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={report.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(Number(report.total))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </HtCard>
    </div>
  );
}
