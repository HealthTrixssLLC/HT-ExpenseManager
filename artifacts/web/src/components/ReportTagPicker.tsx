import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReportTags,
  getListReportTagsQueryKey,
  useSetReportTags,
  useListActiveQboTags,
  getListActiveQboTagsQueryKey,
  type ExpenseReport,
  type QboTag,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { canEditReportTagsClient } from "@/lib/edit-permissions";
import { SILENT_404_META } from "@/lib/queryClient";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Check, Pencil } from "lucide-react";

function TagChip({ tag }: { tag: QboTag }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: tag.color ? `${tag.color}22` : "var(--ht-bg-2)",
        color: tag.color ?? "var(--ht-ink)",
      }}
    >
      {tag.color ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
      ) : null}
      {tag.name}
    </span>
  );
}

export function ReportTagPicker({ report }: { report: ExpenseReport }) {
  const reportId = report.id;
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const canEdit = canEditReportTagsClient(report, user, roles);

  const [editing, setEditing] = useState(false);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());

  const { data: appliedTags = [], isLoading: appliedLoading } = useListReportTags(
    reportId,
    {
      query: {
        queryKey: getListReportTagsQueryKey(reportId),
        enabled: !!reportId,
        meta: SILENT_404_META,
      },
    },
  );

  // Fetch the org-wide active-tag catalog only when the editor opens. Uses
  // the non-admin endpoint so finance + employees can pick tags.
  const { data: orgTags = [], isLoading: orgLoading } = useListActiveQboTags({
    query: {
      queryKey: getListActiveQboTagsQueryKey(),
      enabled: canEdit && editing,
      meta: SILENT_404_META,
    },
  });

  useEffect(() => {
    setDraftIds(new Set(appliedTags.map((t) => t.id)));
  }, [appliedTags]);

  const setTags = useSetReportTags();

  const orderedTags = useMemo(
    () => [...appliedTags].sort((a, b) => a.name.localeCompare(b.name)),
    [appliedTags],
  );

  const handleToggle = (id: string) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    setTags.mutate(
      { id: reportId, data: { tagIds: Array.from(draftIds) } },
      {
        onSuccess: () => {
          setEditing(false);
          qc.invalidateQueries({
            queryKey: getListReportTagsQueryKey(reportId),
          });
        },
      },
    );
  };

  const handleCancel = () => {
    setDraftIds(new Set(appliedTags.map((t) => t.id)));
    setEditing(false);
  };

  return (
    <HtCard data-testid="card-report-tags">
      <HtCardHeader
        title="QBO Tags"
        subtitle="Sent on the JournalEntry posted to QuickBooks Online."
        right={<HelpLink topicId="report-tags" />}
      />
      <div className="space-y-3 p-4">
        {appliedLoading ? (
          <div className="text-xs text-[var(--ht-ink-3)]">Loading tags…</div>
        ) : orderedTags.length === 0 ? (
          <div className="text-xs text-[var(--ht-ink-3)]">
            No tags applied yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="applied-tag-list">
            {orderedTags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}

        {canEdit && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid="btn-edit-report-tags"
          >
            <Pencil className="mr-2 h-3 w-3" />
            Edit tags
          </Button>
        )}

        {canEdit && editing && (
          <div className="space-y-3 border-t border-[var(--ht-border)] pt-3">
            {orgLoading ? (
              <div className="text-xs text-[var(--ht-ink-3)]">
                Loading tag catalog…
              </div>
            ) : orgTags.length === 0 ? (
              <div className="text-xs text-[var(--ht-ink-3)]">
                No tags exist yet. Create them under Admin → QBO tags.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {orgTags
                  .filter((t) => t.active || draftIds.has(t.id))
                  .map((t) => {
                    const selected = draftIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleToggle(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                          selected
                            ? "border-transparent"
                            : "border-[var(--ht-border)] bg-white text-[var(--ht-ink-2)] hover:bg-[var(--ht-bg-2)]"
                        }`}
                        style={
                          selected
                            ? {
                                backgroundColor: t.color
                                  ? `${t.color}22`
                                  : "var(--ht-bg-2)",
                                color: t.color ?? "var(--ht-ink)",
                              }
                            : undefined
                        }
                        data-testid={`toggle-tag-${t.id}`}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                        {t.name}
                      </button>
                    );
                  })}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={setTags.isPending}
                data-testid="btn-save-report-tags"
              >
                {setTags.isPending ? "Saving…" : "Save tags"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={setTags.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </HtCard>
  );
}
