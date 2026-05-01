import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListGlMappings,
  getAdminListGlMappingsQueryKey,
  useAdminUpdateGlMapping,
  useListDepartments,
  getListDepartmentsQueryKey,
  type GlMapping,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
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
import { Pencil, Check, X } from "lucide-react";

export function GlMappingPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qboAccount, setQboAccount] = useState("");

  const { data: mappings = [], isLoading: mappingsLoading } = useAdminListGlMappings({
    query: { queryKey: getAdminListGlMappingsQueryKey() }
  });

  const { data: departments = [] } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() }
  });

  const updateMapping = useAdminUpdateGlMapping();

  const handleEdit = (mapping: GlMapping) => {
    setEditingId(mapping.id);
    setQboAccount(mapping.qboAccount ?? "");
  };

  const handleCancel = () => {
    setEditingId(null);
    setQboAccount("");
  };

  const handleSave = (id: string) => {
    updateMapping.mutate({
      id,
      data: { qboAccount }
    }, {
      onSuccess: () => {
        setEditingId(null);
        qc.invalidateQueries({ queryKey: getAdminListGlMappingsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="page-glmapping">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            GL Mapping
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Map expense categories to QuickBooks Online accounts.
          </p>
        </div>
        <HelpLink topicId="admin-gl" />
      </div>

      <HtCard>
        {mappingsLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading GL mappings...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Category Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>QuickBooks Account Ref</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => {
                const isEditing = editingId === mapping.id;
                
                return (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-medium" colSpan={2}>{mapping.code}</TableCell>
                    <TableCell className="text-[var(--ht-ink-2)]">
                      -
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={qboAccount}
                          onChange={(e) => setQboAccount(e.target.value)}
                          className="h-8 w-48 font-mono text-sm"
                          placeholder="e.g. 5400"
                        />
                      ) : (
                        <span className="font-mono text-sm">{mapping.qboAccount || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleSave(mapping.id)} disabled={updateMapping.isPending}>
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancel}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(mapping)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
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
  );
}
