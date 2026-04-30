import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateReport,
  useListDepartments,
  getListDepartmentsQueryKey
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
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
import { useDirtyGuard, confirmLeaveIfDirty } from "@/hooks/useDirtyGuard";
import { notifySuccess } from "@/lib/notify";

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;

type FormErrors = {
  title?: string;
  description?: string;
  departmentId?: string;
  period?: string;
};

export function CreateReportPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const { data: departments = [] } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() }
  });

  const createReport = useCreateReport();

  const isDirty =
    title.length > 0 ||
    description.length > 0 ||
    periodStart.length > 0 ||
    periodEnd.length > 0 ||
    departmentId.length > 0;

  useDirtyGuard(isDirty && !createReport.isSuccess);

  const errors: FormErrors = useMemo(() => {
    const e: FormErrors = {};
    if (!title.trim()) e.title = "Title is required.";
    else if (title.trim().length < 3) e.title = "Title must be at least 3 characters.";
    else if (title.length > TITLE_MAX) e.title = `Title must be ${TITLE_MAX} characters or fewer.`;
    if (description.length > DESCRIPTION_MAX) e.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    if (!departmentId) e.departmentId = "Department is required.";
    if (periodStart && periodEnd && new Date(periodStart) > new Date(periodEnd)) {
      e.period = "Period start must be on or before period end.";
    }
    return e;
  }, [title, description, departmentId, periodStart, periodEnd]);

  const isValid = Object.keys(errors).length === 0;

  const handleCancel = () => {
    if (confirmLeaveIfDirty(isDirty)) setLocation("/my-reports");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ title: true, description: true, departmentId: true, period: true });
    if (!isValid) return;
    createReport.mutate({
      data: {
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: departmentId || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        policy: "Standard Travel"
      }
    }, {
      onSuccess: (newReport) => {
        notifySuccess("Report created", newReport.displayCode);
        setLocation(`/reports/${newReport.id}`);
      }
    });
  };

  const showError = (k: keyof FormErrors) => touched[k] && errors[k];

  return (
    <div className="space-y-6 max-w-2xl" data-testid="page-createreport">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Create Expense Report
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Start a new report to group your related expenses.
          </p>
        </div>
      </div>

      <HtCard>
        <form onSubmit={handleSubmit} className="p-6 space-y-6" noValidate>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Report Title <span className="text-red-600">*</span></Label>
              <Input
                id="title"
                placeholder="e.g. Q3 Sales Trip - Chicago"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                aria-invalid={!!showError("title")}
                className={showError("title") ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              <div className="flex justify-between text-xs">
                <span className={showError("title") ? "text-red-600" : "text-transparent"}>
                  {errors.title ?? " "}
                </span>
                <span className="text-[var(--ht-ink-3)]">{title.length}/{TITLE_MAX}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Briefly describe the purpose of these expenses..."
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <div className="text-xs text-[var(--ht-ink-3)] text-right">
                {description.length}/{DESCRIPTION_MAX}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Period start (optional)</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, period: true }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period end (optional)</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, period: true }))}
                />
              </div>
              {showError("period") && (
                <div className="col-span-2 text-xs text-red-600">{errors.period}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department <span className="text-red-600">*</span></Label>
              <Select
                value={departmentId}
                onValueChange={(v) => { setDepartmentId(v); setTouched((t) => ({ ...t, departmentId: true })); }}
              >
                <SelectTrigger
                  id="department"
                  aria-invalid={!!showError("departmentId")}
                  className={showError("departmentId") ? "border-red-500 focus-visible:ring-red-500" : ""}
                  onBlur={() => setTouched((t) => ({ ...t, departmentId: true }))}
                >
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showError("departmentId") && (
                <div className="text-xs text-red-600">{errors.departmentId}</div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createReport.isPending}
              data-testid="button-create-report"
            >
              {createReport.isPending ? "Creating..." : "Create Report"}
            </Button>
          </div>
        </form>
      </HtCard>
    </div>
  );
}
