import React, { useState } from "react";
import {
  useAdminAuditLog,
  getAdminAuditLogQueryKey
} from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { HtCard } from "@/components/brand/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AuditLogPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useAdminAuditLog(
    {},
    { query: { queryKey: getAdminAuditLogQueryKey() } }
  );

  return (
    <div className="space-y-6" data-testid="page-auditlog">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Audit Log
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            System-wide event tracking for security and compliance.
          </p>
        </div>
      </div>

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">No logs found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <TableRow 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.actor?.fullName}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {log.fromStatus} &rarr; {log.toStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] text-sm">
                        Expense Report ({log.reportId})
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-gray-50 p-4">
                          <pre className="text-xs text-[var(--ht-ink-2)] bg-white p-4 rounded-md border border-[var(--ht-border)] overflow-auto max-h-64">
                            {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : "No metadata"}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </HtCard>
    </div>
  );
}
