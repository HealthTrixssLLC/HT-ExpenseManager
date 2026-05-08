import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateReport,
  useListDepartments,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  getListLineItemsQueryKey,
  getListReceiptsQueryKey,
  getListReportsQueryKey,
  getListDepartmentsQueryKey,
  type ExpenseReport,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess } from "@/lib/notify";
import { SILENT_404_META } from "@/lib/queryClient";

type Props = {
  report: ExpenseReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NO_DEPARTMENT = "__none__";

// Header-level edit form for a report. Owner + manager + delegate may
// open this any time before the report reaches Finance Approved status;
// the underlying PATCH /reports/:id enforces both checks server-side, so
// this dialog only needs to surface a clean form.
export function EditReportHeaderDialog({ report, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const updateReport = useUpdateReport();
  const { data: departments = [] } = useListDepartments({
    query: {
      queryKey: getListDepartmentsQueryKey(),
      enabled: open,
      meta: SILENT_404_META,
    },
  });

  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description ?? "");
  const [departmentId, setDepartmentId] = useState<string | null>(
    report.departmentId ?? null,
  );
  const [policy, setPolicy] = useState(report.policy ?? "Standard Travel");
  const [periodStart, setPeriodStart] = useState(report.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(report.periodEnd ?? "");
  const [error, setError] = useState<string | null>(null);

  // Re-sync local form state whenever the dialog reopens against a fresh
  // report snapshot (e.g. another tab edited it).
  useEffect(() => {
    if (open) {
      setTitle(report.title);
      setDescription(report.description ?? "");
      setDepartmentId(report.departmentId ?? null);
      setPolicy(report.policy ?? "Standard Travel");
      setPeriodStart(report.periodStart ?? "");
      setPeriodEnd(report.periodEnd ?? "");
      setError(null);
    }
  }, [open, report]);

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      setError("Period end must be on or after the start.");
      return;
    }
    updateReport.mutate(
      {
        id: report.id,
        data: {
          title: title.trim(),
          description: description.trim(),
          departmentId: departmentId,
          policy: policy.trim() || "Standard Travel",
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        },
      },
      {
        onSuccess: (updated) => {
          qc.invalidateQueries({ queryKey: getGetReportQueryKey(report.id) });
          qc.invalidateQueries({
            queryKey: getGetReportTimelineQueryKey(report.id),
          });
          qc.invalidateQueries({
            queryKey: getListLineItemsQueryKey(report.id),
          });
          qc.invalidateQueries({
            queryKey: getListReceiptsQueryKey(report.id),
          });
          qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
          notifySuccess("Report updated", updated?.displayCode);
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const detail =
            (err as { detail?: string; message?: string })?.detail ??
            (err as Error)?.message ??
            "Could not save changes.";
          setError(detail);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-edit-report-header">
        <DialogHeader>
          <DialogTitle>Edit Report Details</DialogTitle>
          <DialogDescription>
            Update the report's header information. Line items and receipts
            are edited individually below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-edit-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodStart">Period start</Label>
              <Input
                id="periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Period end</Label>
              <Input
                id="periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select
              value={departmentId ?? NO_DEPARTMENT}
              onValueChange={(v) =>
                setDepartmentId(v === NO_DEPARTMENT ? null : v)
              }
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="— None —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPARTMENT}>— None —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy">Policy</Label>
            <Input
              id="policy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateReport.isPending}
            data-testid="button-save-report-header"
          >
            {updateReport.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
