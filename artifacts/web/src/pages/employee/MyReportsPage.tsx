import { useState } from "react";
import { Link } from "wouter";
import {
  useListReports,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import { formatMoney, formatDate } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard } from "@/components/brand/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Search } from "lucide-react";

export function MyReportsPage() {
  const [search, setSearch] = useState("");
  
  const { data: reports = [], isLoading } = useListReports(
    { scope: "mine" },
    { query: { queryKey: getListReportsQueryKey({ scope: "mine" }) } }
  );

  const filteredReports = reports.filter(r => 
    r.title.toLowerCase().includes(search.toLowerCase()) || 
    r.displayCode?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="page-myreports">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            My Reports
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Manage your expense reports and track their status.
          </p>
        </div>
        <Link href="/reports/new">
          <Button>
            <PlusCircle className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </Link>
      </div>

      <HtCard>
        <div className="p-4 border-b border-[var(--ht-border)] flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ht-ink-3)]" />
            <Input 
              placeholder="Search reports..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading reports...</div>
        ) : filteredReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            {search ? "No reports match your search." : "You haven't created any reports yet."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-mono text-xs">{report.displayCode}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/reports/${report.id}`}
                      className="text-[var(--ht-primary)] hover:underline"
                    >
                      {report.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-[var(--ht-ink-2)]">
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
