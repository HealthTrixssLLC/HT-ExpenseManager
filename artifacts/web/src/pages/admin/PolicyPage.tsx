import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListPolicyRules,
  getAdminListPolicyRulesQueryKey,
  useAdminPatchPolicyRule,
  type PolicyRule,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
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
import { Pencil, Check, X } from "lucide-react";
import { formatMoney } from "@/lib/format";

export function PolicyPage() {
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState<string | null>(null);
  
  // Edit state
  const [valueStr, setValueStr] = useState("");
  const [description, setDescription] = useState("");

  const { data: rules = [], isLoading: rulesLoading } = useAdminListPolicyRules({
    query: { queryKey: getAdminListPolicyRulesQueryKey() }
  });

  const patchRule = useAdminPatchPolicyRule();

  const handleEdit = (rule: PolicyRule) => {
    setEditingName(rule.name);
    setValueStr(JSON.stringify(rule.value, null, 2));
    setDescription(rule.description ?? "");
  };

  const handleCancel = () => {
    setEditingName(null);
  };

  const handleSave = (name: string) => {
    let parsedValue;
    try {
      parsedValue = JSON.parse(valueStr);
    } catch (e) {
      parsedValue = valueStr;
    }
    patchRule.mutate({
      data: {
        name,
        value: parsedValue,
        description: description || undefined
      }
    }, {
      onSuccess: () => {
        setEditingName(null);
        qc.invalidateQueries({ queryKey: getAdminListPolicyRulesQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="page-policy">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Expense Policy
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Configure auto-flagging rules, receipt requirements, and amount limits by category.
          </p>
        </div>
      </div>

      <HtCard>
        {rulesLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading policy rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">No rules found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Max Amount</TableHead>
                <TableHead className="text-center">Requires Receipt</TableHead>
                <TableHead className="text-center">Requires Pre-approval</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const isEditing = editingName === rule.name;
                
                return (
                  <TableRow key={rule.name}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="h-8 w-64"
                        />
                      ) : (
                        rule.description || <span className="text-[var(--ht-ink-3)]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center" colSpan={2}>
                      {isEditing ? (
                        <Input
                          value={valueStr}
                          onChange={(e) => setValueStr(e.target.value)}
                          className="h-8 w-64 font-mono text-xs mx-auto"
                        />
                      ) : (
                        <pre className="text-xs bg-gray-50 p-1 rounded inline-block max-w-xs overflow-auto">
                          {JSON.stringify(rule.value)}
                        </pre>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleSave(rule.name)} disabled={patchRule.isPending}>
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancel}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
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
