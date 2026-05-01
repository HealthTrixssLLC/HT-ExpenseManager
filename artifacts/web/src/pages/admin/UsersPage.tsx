import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListUsers,
  getAdminListUsersQueryKey,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminDeactivateUser,
  useListDepartments,
  getListDepartmentsQueryKey,
  useListManagers,
  getListManagersQueryKey,
  Role,
  type User,
} from "@workspace/api-client-react";
import { HtCard } from "@/components/brand/Card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pencil, UserPlus, UserX } from "lucide-react";

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
  const deactivateUser = useAdminDeactivateUser();

  const handleCreate = () => {
    if (roles.size === 0) return;
    createUser.mutate(
      {
        data: {
          fullName,
          email,
          password,
          roles: Array.from(roles),
          departmentId,
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
          departmentId,
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

  const handleDeactivate = (id: string) => {
    if (confirm("Are you sure you want to deactivate this user?")) {
      deactivateUser.mutate(
        { id },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
          },
        },
      );
    }
  };

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setRoles(new Set([Role.Employee]));
    setDepartmentId("");
    setManagerId("");
    setIsActive(true);
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setRoles(new Set(user.roles));
    setDepartmentId(user.departmentId || "");
    setManagerId(user.managerId || "");
    setIsActive(user.isActive);
    setEditOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="page-users">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Users
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Manage employee access, roles, and reporting lines.
          </p>
        </div>
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
                <TableRow key={user.id}>
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
                    <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {user.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(user.id)}
                      >
                        <UserX className="w-4 h-4 text-red-500" />
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
              <Label>Roles</Label>
              <RolesCheckboxList
                selected={roles}
                onChange={setRoles}
                idPrefix="create-role"
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
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
                !departmentId ||
                roles.size === 0 ||
                createUser.isPending
              }
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {selectedUser?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Roles</Label>
              <RolesCheckboxList
                selected={roles}
                onChange={setRoles}
                idPrefix="edit-role"
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!departmentId || roles.size === 0 || updateUser.isPending}
            >
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
