import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListQboTags,
  getAdminListQboTagsQueryKey,
  useAdminCreateQboTag,
  useAdminUpdateQboTag,
  useAdminDeleteQboTag,
  type QboTag,
} from "@workspace/api-client-react";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Check, X, Trash2, Plus } from "lucide-react";

const COLOR_PRESETS = [
  "#2CA01C", // QBO green
  "#0EA5E9", // sky
  "#F59E0B", // amber
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#EF4444", // red
  "#64748B", // slate
];

export function QboTagsPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>("");
  const [editActive, setEditActive] = useState(true);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(COLOR_PRESETS[0]);

  const { data: tags = [], isLoading } = useAdminListQboTags({
    query: { queryKey: getAdminListQboTagsQueryKey() },
  });

  const createTag = useAdminCreateQboTag();
  const updateTag = useAdminUpdateQboTag();
  const deleteTag = useAdminDeleteQboTag();

  const refetch = () =>
    qc.invalidateQueries({ queryKey: getAdminListQboTagsQueryKey() });

  const handleEdit = (tag: QboTag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? "");
    setEditActive(tag.active);
  };

  const handleCancelEdit = () => setEditingId(null);

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) return;
    updateTag.mutate(
      {
        id,
        data: {
          name: editName.trim(),
          color: editColor || null,
          active: editActive,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          refetch();
        },
      },
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTag.mutate(
      { data: { name: newName.trim(), color: newColor || null } },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor(COLOR_PRESETS[0]);
          refetch();
        },
      },
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"? This removes it from every report it's applied to.`)) {
      return;
    }
    deleteTag.mutate({ id }, { onSuccess: () => refetch() });
  };

  return (
    <div className="space-y-6" data-testid="page-qbo-tags">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            QBO Tags
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Org-wide labels sent on every JournalEntry posted to QuickBooks Online.
          </p>
        </div>
        <HelpLink topicId="admin-qbo-tags" />
      </div>

      <div style={{ maxWidth: "48rem" }} className="space-y-6">
        <HtCard>
          <HtCardHeader title="Add a tag" />
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="new-tag-name">Name</Label>
                <Input
                  id="new-tag-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Reimbursable, Client A, R&D"
                  maxLength={64}
                  data-testid="input-new-tag-name"
                />
              </div>
              <div className="space-y-1">
                <Label>Color</Label>
                <div className="flex items-center gap-1">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{
                        backgroundColor: c,
                        borderColor: newColor === c ? "var(--ht-ink)" : "transparent",
                      }}
                      aria-label={`color ${c}`}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createTag.isPending}
                data-testid="btn-create-tag"
              >
                <Plus className="mr-2 h-4 w-4" />
                {createTag.isPending ? "Adding…" : "Add tag"}
              </Button>
            </div>
          </div>
        </HtCard>

        <HtCard>
          <HtCardHeader title={`Existing tags (${tags.length})`} />
          {isLoading ? (
            <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
              Loading tags…
            </div>
          ) : tags.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
              No tags yet. Add one above to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => {
                  const isEditing = editingId === tag.id;
                  return (
                    <TableRow key={tag.id} data-testid={`row-tag-${tag.id}`}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={64}
                            className="h-8 w-48"
                          />
                        ) : (
                          <span
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                            style={{
                              backgroundColor: tag.color ? `${tag.color}22` : "var(--ht-bg-2)",
                              color: tag.color ?? "var(--ht-ink)",
                            }}
                          >
                            {tag.color ? (
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                            ) : null}
                            {tag.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            {COLOR_PRESETS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditColor(c)}
                                className="h-6 w-6 rounded-full border-2 transition"
                                style={{
                                  backgroundColor: c,
                                  borderColor:
                                    editColor === c ? "var(--ht-ink)" : "transparent",
                                }}
                                aria-label={`color ${c}`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-[var(--ht-ink-3)]">
                            {tag.color ?? "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Switch
                            checked={editActive}
                            onCheckedChange={setEditActive}
                          />
                        ) : tag.active ? (
                          <span className="text-sm text-green-700">Active</span>
                        ) : (
                          <span className="text-sm text-[var(--ht-ink-3)]">
                            Archived
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveEdit(tag.id)}
                              disabled={updateTag.isPending}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(tag)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(tag.id, tag.name)}
                              disabled={deleteTag.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </HtCard>
      </div>
    </div>
  );
}
