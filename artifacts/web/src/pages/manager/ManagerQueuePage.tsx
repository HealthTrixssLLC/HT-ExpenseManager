import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { formatMoney, formatRelative } from "@/lib/format";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useManagerQueue,
  getManagerQueueQueryKey,
  useManagerApprove,
  type ExpenseReportSummary,
} from "@workspace/api-client-react";
import { Clock } from "lucide-react";
import { notifySuccess } from "@/lib/notify";

type AgeBucket = "all" | "today" | "<3d" | "<7d" | ">7d";

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function ageBucketLabel(days: number): { label: string; tone: string } {
  if (days <= 0) return { label: "Today", tone: "text-emerald-700 bg-emerald-50" };
  if (days < 3) return { label: `${days}d`, tone: "text-[var(--ht-ink-2)] bg-gray-100" };
  if (days < 7) return { label: `${days}d`, tone: "text-amber-700 bg-amber-50" };
  return { label: `${days}d`, tone: "text-red-700 bg-red-50" };
}

export function ManagerQueuePage() {
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useManagerQueue({
    query: { queryKey: getManagerQueueQueryKey() }
  });

  const [search, setSearch] = useState("");
  const [age, setAge] = useState<AgeBucket>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const approve = useManagerApprove();

  const filtered = useMemo<ExpenseReportSummary[]>(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.displayCode} ${r.employee?.fullName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (age !== "all") {
        const d = ageDays(r.updatedAt);
        if (age === "today" && d > 0) return false;
        if (age === "<3d" && d >= 3) return false;
        if (age === "<7d" && d >= 7) return false;
        if (age === ">7d" && d < 7) return false;
      }
      return true;
    });
  }, [reports, search, age]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) filtered.forEach((r) => next.add(r.id));
      else filtered.forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const total = ids.length;
    let ok = 0;
    for (const id of ids) {
      try {
        await approve.mutateAsync({ id, data: { comment: "" } });
        ok += 1;
      } catch {
        // global error toast handles failure
      }
    }
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: getManagerQueueQueryKey() });
    if (ok > 0) {
      notifySuccess(
        ok === total ? "Approved" : "Partially Approved",
        `${ok} of ${total} report${total === 1 ? "" : "s"} approved.`,
      );
    }
  };

  const totalSelected = filtered
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + Number(r.total), 0);

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

      <div className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="input-queue-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by employee, title, or code…"
          className="max-w-xs"
        />
        <Select value={age} onValueChange={(v) => setAge(v as AgeBucket)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
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

      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-[var(--ht-primary-soft,#EEF2F8)] border border-[var(--ht-border)] rounded-md p-3">
          <div className="text-sm text-[var(--ht-ink-2)]">
            <span className="font-medium text-[var(--ht-ink)]">{selected.size}</span> selected
            <span className="ml-2 text-[var(--ht-ink-3)]">({formatMoney(totalSelected)})</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              data-testid="button-batch-approve"
              onClick={handleBatchApprove}
              disabled={approve.isPending}
            >
              {approve.isPending ? "Approving…" : `Approve ${selected.size}`}
            </Button>
          </div>
        </div>
      )}

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading queue...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            You're all caught up! No reports in your queue.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            No reports match those filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(c) => toggleAll(!!c)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((report) => {
                const days = ageDays(report.updatedAt);
                const ag = ageBucketLabel(days);
                return (
                  <TableRow key={report.id} data-testid={`table-row-report-${report.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(report.id)}
                        onCheckedChange={(c) => toggleOne(report.id, !!c)}
                        aria-label={`Select ${report.displayCode}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{report.displayCode}</TableCell>
                    <TableCell>
                      <Link
                        href={`/manager/queue/${report.id}`}
                        className="font-medium text-[var(--ht-primary)] hover:underline"
                      >
                        {report.title}
                      </Link>
                    </TableCell>
                    <TableCell>{report.employee?.fullName}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ag.tone}`}>
                        <Clock className="w-3 h-3" />
                        {ag.label}
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
