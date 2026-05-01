import { useAuth } from "@/lib/auth-context";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Mail, Building2, UserCircle, Shield } from "lucide-react";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/format";

export function ProfilePage() {
  const { user, roles, session, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) {
    return (
      <div className="p-8 text-center text-[var(--ht-ink-3)]">Loading profile…</div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="page-profile">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
          My Profile
        </h1>
        <p className="text-sm text-[var(--ht-ink-3)]">
          Your account information and current session.
        </p>
      </div>

      <HtCard>
        <HtCardHeader title="Account" />
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="flex items-start gap-3">
            <UserCircle className="w-5 h-5 mt-0.5 text-[var(--ht-ink-3)]" />
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--ht-ink-3)]">Full name</div>
              <div className="font-medium text-[var(--ht-ink)]">{user.fullName}</div>
              {user.title && (
                <div className="text-xs text-[var(--ht-ink-3)]">{user.title}</div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 mt-0.5 text-[var(--ht-ink-3)]" />
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--ht-ink-3)]">Email</div>
              <div className="font-medium text-[var(--ht-ink)]">{user.email}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 mt-0.5 text-[var(--ht-ink-3)]" />
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--ht-ink-3)]">
                {roles.length > 1 ? "Roles" : "Role"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {roles.map((r) => (
                  <Badge key={r} variant="secondary" className="font-medium">
                    {r}
                  </Badge>
                ))}
                {user.isAlsoEmployee && (
                  <Badge variant="outline" className="text-xs">Also employee</Badge>
                )}
                {!user.isActive && (
                  <Badge variant="destructive" className="text-xs">Inactive</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 mt-0.5 text-[var(--ht-ink-3)]" />
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--ht-ink-3)]">Department</div>
              <div className="font-medium text-[var(--ht-ink)]">{user.departmentName ?? "—"}</div>
              {user.managerName && (
                <div className="text-xs text-[var(--ht-ink-3)]">Manager: {user.managerName}</div>
              )}
            </div>
          </div>
        </div>
      </HtCard>

      <HtCard>
        <HtCardHeader title="Session" />
        <div className="p-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--ht-ink-3)]">Member since</span>
            <span className="font-medium">{formatDate(user.createdAt)}</span>
          </div>
          {session?.sessionExpiresAt && (
            <div className="flex justify-between">
              <span className="text-[var(--ht-ink-3)]">Session expires</span>
              <span className="font-medium">{formatDate(session.sessionExpiresAt)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-[var(--ht-border)] flex items-center justify-between">
            <div className="text-xs text-[var(--ht-ink-3)]">
              Need to switch accounts? Sign out and log in again.
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              data-testid="button-logout"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </HtCard>
    </div>
  );
}
