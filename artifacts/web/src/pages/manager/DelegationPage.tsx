import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminListDelegations,
  getAdminListDelegationsQueryKey,
  useAdminCreateDelegation,
  useAdminRevokeDelegation,
  useListManagers,
  getListManagersQueryKey
} from "@workspace/api-client-react";
import { useAuthedUser } from "@/lib/auth-context";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/format";

export function DelegationPage() {
  const qc = useQueryClient();
  const currentUser = useAuthedUser();

  const [toManagerId, setToManagerId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const { data: delegations = [], isLoading: delegationsLoading } = useAdminListDelegations(
    undefined,
    { query: { queryKey: getAdminListDelegationsQueryKey() } }
  );

  const { data: managers = [] } = useListManagers({
    query: { queryKey: getListManagersQueryKey() }
  });

  const createDelegation = useAdminCreateDelegation();
  const revokeDelegation = useAdminRevokeDelegation();

  // For this page, we show delegations where the current user is the delegator
  // Unless they are an admin, in which case they see all. 
  // Let's just filter to current user's delegations to match the prompt's intent.
  const isAdmin = currentUser.roles.some(
    (r) => r === "System Admin" || r === "Accounting Admin",
  );
  const myDelegations = isAdmin
    ? delegations
    : delegations.filter((d) => d.fromManagerId === currentUser.user.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toManagerId || !startsAt || !endsAt) return;

    createDelegation.mutate({
      data: {
        fromManagerId: currentUser.user.id,
        toManagerId,
        startsAt,
        endsAt
      }
    }, {
      onSuccess: () => {
        setToManagerId("");
        setStartsAt("");
        setEndsAt("");
        qc.invalidateQueries({ queryKey: getAdminListDelegationsQueryKey() });
      }
    });
  };

  const handleRevoke = (id: string) => {
    if (confirm("Are you sure you want to revoke this delegation?")) {
      revokeDelegation.mutate({ id }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getAdminListDelegationsQueryKey() });
        }
      });
    }
  };

  const availableManagers = managers.filter(m => m.id !== currentUser.user.id);

  return (
    <div className="space-y-6 max-w-4xl" data-testid="page-delegation">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
          Approval Delegation
        </h1>
        <p className="text-sm text-[var(--ht-ink-3)]">
          Temporarily route your approval queue to another manager while you are away.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <HtCard>
            <HtCardHeader title="Active Delegations" />
            {delegationsLoading ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading delegations...</div>
            ) : myDelegations.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
                You have no active delegations.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead>Delegator</TableHead>}
                    <TableHead>Delegate To</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myDelegations.map((d) => (
                    <TableRow key={d.id}>
                      {isAdmin && (
                        <TableCell>{d.fromManagerName}</TableCell>
                      )}
                      <TableCell className="font-medium">
                        {d.toManagerName}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--ht-ink-2)]">{formatDate(d.startsAt)}</TableCell>
                      <TableCell className="text-sm text-[var(--ht-ink-2)]">{formatDate(d.endsAt)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(d.id)} disabled={revokeDelegation.isPending}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </HtCard>
        </div>

        <div>
          <HtCard>
            <HtCardHeader title="New Delegation" />
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="delegateTo">Delegate To</Label>
                <Select value={toManagerId} onValueChange={setToManagerId} required>
                  <SelectTrigger id="delegateTo">
                    <SelectValue placeholder="Select Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableManagers.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endsAt}
                  onChange={e => setEndsAt(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={createDelegation.isPending || !toManagerId || !startsAt || !endsAt}>
                <UserPlus className="w-4 h-4 mr-2" />
                {createDelegation.isPending ? "Creating..." : "Create Delegation"}
              </Button>
            </form>
          </HtCard>
        </div>
      </div>
    </div>
  );
}
