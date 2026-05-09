import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListUsers,
  getAdminListUsersQueryKey,
  useAdminCreateUser,
  useAdminUpdateUser,
  useListDepartments,
  getListDepartmentsQueryKey,
  useListManagers,
  getListManagersQueryKey,
  Role,
  type User,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { describeApiError } from "@/lib/api";

const ALL_ROLES: Role[] = [
  Role.Employee,
  Role.Manager_Approver,
  Role.Finance_Approver,
  Role.Accounting_Admin,
  Role.System_Admin,
];

function RolesCheckboxList({
  selected,
  onChange,
  idPrefix,
}: {
  selected: Set<Role>;
  onChange: (next: Set<Role>) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border p-3">
      {ALL_ROLES.map((r) => {
        const checked = selected.has(r);
        const id = `${idPrefix}-${r}`;
        return (
          <label
            key={r}
            htmlFor={id}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(v) => {
                const next = new Set(selected);
                if (v) next.add(r);
                else next.delete(r);
                onChange(next);
              }}
            />
            <span>{r}</span>
          </label>
        );
      })}
      {selected.size === 0 && (
        <div className="text-xs text-red-600">At least one role is required.</div>
      )}
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<Set<Role>>(new Set([Role.Employee]));
  const [departmentId, setDepartmentId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [title, setTitle] = useState("");
  const [isAlsoEmployee, setIsAlsoEmployee] = useState(false);

  const { data: users = [], isLoading: usersLoading } = useAdminListUsers({
    query: { queryKey: getAdminListUsersQueryKey() },
  });

  const { data: departments = [] } = useListDepartments({
    query: { queryKey: getListDepartmentsQueryKey() },
  });

  const { data: managers = [] } = useListManagers({
    query: { queryKey: getListManagersQueryKey() },
  });

  const createUser = useAdminCreateUser();
  const updateUser = useAdminUpdateUser();
  const { user: currentUser } = useAuth();
  const [confirmTarget, setConfirmTarget] = useState<
    { user: User; mode: "activate" | "deactivate" } | null
  >(null);

  const handleCreate = () => {
    if (roles.size === 0) return;
    createUser.mutate(
      {
        data: {
          fullName,
          email,
          password,
          roles: Array.from(roles),
          title: title.trim() ? title.trim() : undefined,
          isAlsoEmployee,
          departmentId: departmentId || undefined,
          managerId: managerId || undefined,
        },
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
          resetForm();
        },
      },
    );
  };

  const handleEdit = () => {
    if (!selectedUser) return;
    if (roles.size === 0) return;
    updateUser.mutate(
      {
        id: selectedUser.id,
        data: {
          roles: Array.from(roles),
          title: title.trim() ? title.trim() : null,
          isAlsoEmployee,
          departmentId: departmentId || null,
          managerId: managerId || null,
          isActive,
        },
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        },
      },
    );
  };

  const confirmActivation = () => {
    if (!confirmTarget) return;
    const { user, mode } = confirmTarget;
    updateUser.mutate(
      { id: user.id, data: { isActive: mode === "activate" } },
      {
        onSuccess: () => {
          setConfirmTarget(null);
          qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        },
      },
    );
  };

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setRoles(new Set([Role.Employee]));
    setDepartmentId("");
    setManagerId("");
    setIsActive(true);
    setTitle("");
    setIsAlsoEmployee(false);
    createUser.reset();
    updateUser.reset();
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setRoles(new Set(user.roles));
    setDepartmentId(user.departmentId || "");
    setManagerId(user.managerId || "");
    setIsActive(user.isActive);
    setTitle(user.title ?? "");
    setIsAlsoEmployee(user.isAlsoEmployee ?? false);
    updateUser.reset();
    setEditOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="page-users">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Users
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Manage employee access, roles, and reporting lines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HelpLink topicId="admin-users" />
          <Button
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      <HtCard>
        {usersLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            Loading users...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  data-testid={`row-user-${user.email}`}
                  className={
                    user.isActive
                      ? undefined
                      : "bg-muted/40 text-[var(--ht-ink-3)]"
                  }
                >
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell className="text-[var(--ht-ink-2)]">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-[var(--ht-ink-2)]">
                    {user.departmentName ?? "-"}
                  </TableCell>
                  <TableCell className="text-[var(--ht-ink-2)]">
                    {user.managerName ?? "-"}
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(user)}
                      data-testid={`btn-edit-${user.email}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {user.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title={
                          currentUser?.id === user.id
                            ? "You can't deactivate your own account."
                            : "Deactivate user"
                        }
                        disabled={currentUser?.id === user.id}
                        onClick={() =>
                          setConfirmTarget({ user, mode: "deactivate" })
                        }
                        data-testid={`btn-deactivate-${user.email}`}
                      >
                        <UserX className="w-4 h-4 text-red-500" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Activate user"
                        onClick={() =>
                          setConfirmTarget({ user, mode: "activate" })
                        }
                        data-testid={`btn-activate-${user.email}`}
                      >
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </HtCard>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (Optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <RolesCheckboxList
                selected={roles}
                onChange={setRoles}
                idPrefix="create-role"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="create-also-employee"
                checked={isAlsoEmployee}
                onCheckedChange={setIsAlsoEmployee}
              />
              <Label htmlFor="create-also-employee">
                Also an employee (can submit their own reports)
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Department (Optional)</Label>
              <Select
                value={departmentId || "none"}
                onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Manager (Optional)</Label>
              <Select
                value={managerId || "none"}
                onValueChange={(v) => setManagerId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createUser.error ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                data-testid="create-user-error"
              >
                <div className="font-medium">
                  {describeApiError(createUser.error).title}
                </div>
                <div>{describeApiError(createUser.error).detail}</div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !fullName ||
                !email ||
                !password ||
                roles.size === 0 ||
                createUser.isPending
              }
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate / Deactivate confirmation */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-activation">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.mode === "activate"
                ? "Activate user?"
                : "Deactivate user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.mode === "activate" ? (
                <>
                  <strong>{confirmTarget?.user.fullName}</strong> will be able
                  to sign in again immediately. Their existing roles, manager,
                  and department are preserved.
                </>
              ) : (
                <>
                  <strong>{confirmTarget?.user.fullName}</strong> will no
                  longer be able to sign in. Their reports remain in the
                  system. You can reactivate them at any time.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-confirm-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmActivation();
              }}
              disabled={updateUser.isPending}
              data-testid="btn-confirm-activation"
            >
              {confirmTarget?.mode === "activate"
                ? updateUser.isPending
                  ? "Activating..."
                  : "Activate"
                : updateUser.isPending
                  ? "Deactivating..."
                  : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {selectedUser?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title (Optional)</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <RolesCheckboxList
                selected={roles}
                onChange={setRoles}
                idPrefix="edit-role"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-also-employee"
                checked={isAlsoEmployee}
                onCheckedChange={setIsAlsoEmployee}
              />
              <Label htmlFor="edit-also-employee">
                Also an employee (can submit their own reports)
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Department (Optional)</Label>
              <Select
                value={departmentId || "none"}
                onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Manager (Optional)</Label>
              <Select
                value={managerId || "none"}
                onValueChange={(v) => setManagerId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="active">Active User</Label>
            </div>
            {updateUser.error ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                data-testid="edit-user-error"
              >
                <div className="font-medium">
                  {describeApiError(updateUser.error).title}
                </div>
                <div>{describeApiError(updateUser.error).detail}</div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={roles.size === 0 || updateUser.isPending}
            >
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
