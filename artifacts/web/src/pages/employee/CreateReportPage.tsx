import { useState } from "react";
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
import { formatMoney } from "@/lib/format";

export function CreateReportPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const { data: departments = [] } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() }
  });

  const createReport = useCreateReport();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createReport.mutate({
      data: {
        title,
        description,
        departmentId: departmentId || undefined,
        policy: "Standard Travel"
      }
    }, {
      onSuccess: (newReport) => {
        setLocation(`/reports/${newReport.id}`);
      }
    });
  };

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
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Report Title</Label>
              <Input
                id="title"
                placeholder="e.g. Q3 Sales Trip - Chicago"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Briefly describe the purpose of these expenses..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} required>
                <SelectTrigger id="department">
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
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setLocation("/my-reports")}>
              Cancel
            </Button>
            <Button type="submit" disabled={createReport.isPending}>
              {createReport.isPending ? "Creating..." : "Create Report"}
            </Button>
          </div>
        </form>
      </HtCard>
    </div>
  );
}
