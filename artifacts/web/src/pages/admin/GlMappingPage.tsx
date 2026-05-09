import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListGlMappings,
  getAdminListGlMappingsQueryKey,
  useAdminUpdateGlMapping,
  useAdminGetQboConnection,
  getAdminGetQboConnectionQueryKey,
  adminListQboAccounts,
  useAdminListQboAccounts,
  getAdminListQboAccountsQueryKey,
  useAdminListDepartments,
  getAdminListDepartmentsQueryKey,
  useAdminCreateDepartment,
  useAdminRenameDepartment,
  useAdminDeleteDepartment,
  getListDepartmentsQueryKey,
  type GlMapping,
  type QboAccount,
  type AdminDepartment,
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
import { AlertTriangle, Pencil, Check, X, RefreshCcw, Search, Trash2, Plus } from "lucide-react";
import { describeApiError } from "@/lib/api";

interface AccountPickerProps {
  value: string;
  onChange: (next: { qboAccount: string; qboAccountId: string | null; qboAccountType: string | null }) => void;
  realConnected: boolean;
}

function AccountPicker({ value, onChange, realConnected }: AccountPickerProps) {
  const qc = useQueryClient();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  // Close popover when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const params = useMemo(
    () => ({ q: query.trim() || undefined }),
    [query],
  );

  const accountsQuery = useAdminListQboAccounts(params, {
    query: {
      queryKey: getAdminListQboAccountsQueryKey(params),
      enabled: realConnected && open,
    },
  });

  if (!realConnected) {
    // Stub mode: simple free-text input — no COA data available.
    return (
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange({
            qboAccount: e.target.value,
            qboAccountId: null,
            qboAccountType: null,
          });
        }}
        className="h-8 w-56 font-mono text-sm"
        placeholder="e.g. 5400 Travel"
      />
    );
  }

  // Force a server-side cache bypass by hitting the endpoint directly
  // with ?refresh=true (the React Query hook caches by params, so a
  // simple refetch would re-hit the cached path). After the network
  // call returns, invalidate every cached variant so subsequent
  // typeahead requests see the fresh COA.
  const handleRefresh = async () => {
    try {
      await adminListQboAccounts({ refresh: true, q: params.q });
    } catch (err) {
      console.warn("Failed to refresh QBO accounts", err);
    }
    qc.invalidateQueries({
      queryKey: getAdminListQboAccountsQueryKey({}),
      exact: false,
    });
    accountsQuery.refetch();
  };

  const handlePick = (acct: QboAccount) => {
    setQuery(acct.fullyQualifiedName);
    setOpen(false);
    onChange({
      qboAccount: acct.fullyQualifiedName,
      qboAccountId: acct.id,
      qboAccountType: acct.accountType,
    });
  };

  const accounts = accountsQuery.data ?? [];

  return (
    <div ref={wrapRef} className="relative w-72">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ht-ink-3)]" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-8 w-full pl-7 font-mono text-sm"
            placeholder="Search QBO accounts…"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={accountsQuery.isFetching}
          title="Refresh accounts from QuickBooks"
        >
          <RefreshCcw className="h-3 w-3" />
        </Button>
      </div>
      {open ? (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[var(--ht-border)] bg-white shadow-lg">
          {accountsQuery.isFetching ? (
            <div className="p-3 text-xs text-[var(--ht-ink-3)]">
              Loading accounts…
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-3 text-xs text-[var(--ht-ink-3)]">
              No matching accounts. Try Refresh to re-pull from QuickBooks.
            </div>
          ) : (
            accounts.slice(0, 50).map((acct) => (
              <button
                key={acct.id}
                type="button"
                onClick={() => handlePick(acct)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--ht-bg-2)] ${
                  acct.active ? "" : "opacity-60"
                }`}
                data-testid={`option-acct-${acct.id}`}
                title={
                  acct.active
                    ? undefined
                    : "Inactive in QuickBooks — selecting may cause sync errors."
                }
              >
                <div className="flex items-center gap-2 font-medium text-[var(--ht-ink)]">
                  <span>{acct.fullyQualifiedName}</span>
                  {!acct.active && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800"
                      data-testid={`badge-inactive-${acct.id}`}
                    >
                      Inactive
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--ht-ink-3)]">
                  {acct.accountType}
                  {acct.accountSubType ? ` · ${acct.accountSubType}` : ""} · ID {acct.id}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GlMappingPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    qboAccount: string;
    qboAccountId: string | null;
    qboAccountType: string | null;
  }>({ qboAccount: "", qboAccountId: null, qboAccountType: null });

  const { data: mappings = [], isLoading: mappingsLoading } = useAdminListGlMappings({
    query: { queryKey: getAdminListGlMappingsQueryKey() },
  });

  const { data: connection } = useAdminGetQboConnection({
    query: { queryKey: getAdminGetQboConnectionQueryKey() },
  });

  const realConnected =
    connection?.mode === "real" && connection.status === "connected";

  // When real-connected, pull the full COA once so the table can warn for
  // any mapping whose account has gone inactive (or vanished) in QBO. The
  // backend caches this list, so it's a cheap call for the page load.
  const { data: allAccounts = [] } = useAdminListQboAccounts(
    {},
    {
      query: {
        queryKey: getAdminListQboAccountsQueryKey({}),
        enabled: realConnected,
      },
    },
  );
  const accountById = useMemo(() => {
    const m = new Map<string, QboAccount>();
    for (const a of allAccounts) m.set(a.id, a);
    return m;
  }, [allAccounts]);

  const updateMapping = useAdminUpdateGlMapping();

  const handleEdit = (mapping: GlMapping) => {
    setEditingId(mapping.id);
    setDraft({
      qboAccount: mapping.qboAccount ?? "",
      qboAccountId: mapping.qboAccountId ?? null,
      qboAccountType: mapping.qboAccountType ?? null,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setDraft({ qboAccount: "", qboAccountId: null, qboAccountType: null });
  };

  const handleSave = (id: string) => {
    updateMapping.mutate(
      {
        id,
        data: {
          qboAccount: draft.qboAccount,
          qboAccountId: draft.qboAccountId,
          qboAccountType: draft.qboAccountType,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          qc.invalidateQueries({ queryKey: getAdminListGlMappingsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="page-glmapping">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Departments &amp; GL
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Manage the departments employees can pick on their reports, and
            map each expense category to a QuickBooks Online account.{" "}
            {realConnected
              ? "Use the GL picker to search your real QBO Chart of Accounts."
              : "Demo mode: enter account references as free text."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpLink topicId="admin-gl" />
          <HelpLink topicId="admin-gl-mapping-picker" label="Picker help" />
        </div>
      </div>

      <DepartmentsCard />

      <div>
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-[var(--ht-ink)]">
          GL Mapping
        </h2>
      <HtCard>
        {mappingsLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            Loading GL mappings...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>QuickBooks Account</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => {
                const isEditing = editingId === mapping.id;
                // Warn when the mapped account is missing from the org's
                // current COA snapshot, OR exists but is now inactive. Only
                // meaningful when we're real-connected — stub mode has no
                // server-side notion of an active flag.
                const matched = mapping.qboAccountId
                  ? accountById.get(mapping.qboAccountId)
                  : undefined;
                const inactiveWarning =
                  realConnected && mapping.qboAccountId
                    ? !matched
                      ? "Mapped account no longer exists in QuickBooks. Pick a replacement."
                      : !matched.active
                        ? "Mapped account is inactive in QuickBooks — JournalEntry posting will fail."
                        : null
                    : null;

                return (
                  <TableRow key={mapping.id} data-testid={`row-mapping-${mapping.id}`}>
                    <TableCell className="font-medium">{mapping.code}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <AccountPicker
                          value={draft.qboAccount}
                          onChange={setDraft}
                          realConnected={realConnected}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">
                            {mapping.qboAccount || "—"}
                          </span>
                          {inactiveWarning ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800"
                              title={inactiveWarning}
                              data-testid={`warn-mapping-inactive-${mapping.id}`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Inactive
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--ht-ink-3)]">
                      {isEditing ? draft.qboAccountId ?? "—" : mapping.qboAccountId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--ht-ink-3)]">
                      {isEditing ? draft.qboAccountType ?? "—" : mapping.qboAccountType ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSave(mapping.id)}
                            disabled={updateMapping.isPending}
                            data-testid={`btn-save-mapping-${mapping.id}`}
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancel}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(mapping)}
                          data-testid={`btn-edit-mapping-${mapping.id}`}
                        >
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
    </div>
  );
}

function DepartmentsCard() {
  const qc = useQueryClient();
  const departmentsQuery = useAdminListDepartments({
    query: { queryKey: getAdminListDepartmentsQueryKey() },
  });
  const departments = departmentsQuery.data ?? [];

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null,
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getAdminListDepartmentsQueryKey() });
    qc.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
  };

  const createDept = useAdminCreateDepartment();
  const renameDept = useAdminRenameDepartment();
  const deleteDept = useAdminDeleteDepartment();

  const handleCreate = () => {
    const name = newName.trim();
    setCreateError(null);
    if (!name) {
      setCreateError("Enter a department name.");
      return;
    }
    createDept.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          setNewName("");
          invalidateAll();
        },
        onError: (err) => {
          setCreateError(describeApiError(err).detail);
        },
      },
    );
  };

  const handleEdit = (dept: AdminDepartment) => {
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditError(null);
    setRowError(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditName("");
    setEditError(null);
  };

  const handleRename = (id: string) => {
    const name = editName.trim();
    setEditError(null);
    if (!name) {
      setEditError("Department name is required.");
      return;
    }
    renameDept.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditName("");
          invalidateAll();
        },
        onError: (err) => {
          setEditError(describeApiError(err).detail);
        },
      },
    );
  };

  const handleDelete = (dept: AdminDepartment) => {
    setRowError(null);
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    deleteDept.mutate(
      { id: dept.id },
      {
        onSuccess: () => {
          invalidateAll();
        },
        onError: (err) => {
          setRowError({ id: dept.id, message: describeApiError(err).detail });
        },
      },
    );
  };

  return (
    <div data-testid="section-departments">
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-[var(--ht-ink)]">
        Departments
      </h2>
      <HtCard>
        {departmentsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            Loading departments...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => {
                const isEditing = editingId === dept.id;
                const showRowError = rowError?.id === dept.id;
                return (
                  <TableRow
                    key={dept.id}
                    data-testid={`row-department-${dept.id}`}
                  >
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 w-64"
                            data-testid={`input-edit-department-${dept.id}`}
                            autoFocus
                          />
                          {editError ? (
                            <div
                              className="text-xs text-red-600"
                              data-testid={`error-edit-department-${dept.id}`}
                            >
                              {editError}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span>{dept.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--ht-ink-3)]">
                      {dept.userCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRename(dept.id)}
                            disabled={renameDept.isPending}
                            data-testid={`btn-save-department-${dept.id}`}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(dept)}
                              data-testid={`btn-edit-department-${dept.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(dept)}
                              disabled={deleteDept.isPending}
                              data-testid={`btn-delete-department-${dept.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                          {showRowError ? (
                            <div
                              className="max-w-xs text-right text-xs text-red-600"
                              data-testid={`error-department-${dept.id}`}
                            >
                              {rowError!.message}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="New department name"
                      className="h-8 w-64"
                      data-testid="input-new-department"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                      }}
                    />
                    {createError ? (
                      <div
                        className="text-xs text-red-600"
                        data-testid="error-new-department"
                      >
                        {createError}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell />
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreate}
                    disabled={createDept.isPending}
                    data-testid="btn-add-department"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add department
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </HtCard>
    </div>
  );
}
