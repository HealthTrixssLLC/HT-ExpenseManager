import type { ReactNode } from "react";
import {
  LayoutDashboard,
  ScrollText,
  Inbox,
  Wallet,
  ClipboardCheck,
  BarChart3,
  BookOpen,
  Settings,
  Users,
  Sparkles,
  Building2,
  ShieldCheck,
  ScrollIcon,
  UserCircle,
} from "lucide-react";
import { DesktopTopbar } from "@/components/brand/BrandHeader";
import { SidebarNav, type NavSection } from "@/components/brand/SidebarNav";
import { useAuth } from "@/lib/auth-context";
import {
  roleCanFinanceReview,
  roleCanManagerReview,
  roleCanAdmin,
  type Role,
} from "@/lib/types";

function buildSections(roles: Role[]): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "My work",
      items: [
        { label: "Dashboard", icon: <LayoutDashboard size={16} />, href: "/" },
        { label: "My reports", icon: <ScrollText size={16} />, href: "/my-reports" },
      ],
    },
  ];

  if (roleCanManagerReview(roles)) {
    sections.push({
      title: "Manager",
      items: [
        { label: "Approval queue", icon: <Inbox size={16} />, href: "/manager/queue" },
        {
          label: "Delegation",
          icon: <Sparkles size={16} />,
          href: "/manager/delegation",
        },
      ],
    });
  }

  if (roleCanFinanceReview(roles)) {
    sections.push({
      title: "Finance",
      items: [
        {
          label: "Finance queue",
          icon: <ClipboardCheck size={16} />,
          href: "/finance/queue",
        },
        {
          label: "Payroll batches",
          icon: <Wallet size={16} />,
          href: "/finance/payroll",
        },
        {
          label: "Reconciliation",
          icon: <ScrollIcon size={16} />,
          href: "/finance/reconciliation",
        },
      ],
    });
  }

  sections.push({
    title: "Insights",
    items: [
      { label: "Reports & analytics", icon: <BarChart3 size={16} />, href: "/reports" },
    ],
  });

  sections.push({
    title: "Account",
    items: [
      { label: "My profile", icon: <UserCircle size={16} />, href: "/profile" },
      { label: "Help center", icon: <BookOpen size={16} />, href: "/help" },
    ],
  });

  if (roleCanAdmin(roles)) {
    sections.push({
      title: "Admin",
      items: [
        { label: "Users", icon: <Users size={16} />, href: "/admin/users" },
        {
          label: "Departments & GL",
          icon: <Building2 size={16} />,
          href: "/admin/gl",
        },
        {
          label: "Policy rules",
          icon: <ShieldCheck size={16} />,
          href: "/admin/policy",
        },
        {
          label: "QuickBooks",
          icon: <Settings size={16} />,
          href: "/admin/qbo",
        },
        { label: "Audit log", icon: <ScrollText size={16} />, href: "/admin/audit" },
      ],
    });
  }

  return sections;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, logout } = useAuth();
  if (!user || roles.length === 0) return null;
  const sections = buildSections(roles);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--ht-canvas)",
      }}
    >
      <DesktopTopbar
        user={user.fullName}
        roles={roles}
        onSignOut={() => {
          void logout();
        }}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <SidebarNav
          sections={sections}
          footer={
            <div
              style={{
                fontSize: 11,
                color: "var(--ht-ink-3)",
                padding: "12px 10px 4px",
                borderTop: "1px solid var(--ht-border)",
                marginTop: 8,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--ht-ink-2)" }}>
                {user.fullName}
              </div>
              <div>{roles.join(" · ")}</div>
              {user.departmentName && <div>{user.departmentName}</div>}
            </div>
          }
        />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            padding: "28px 32px 48px",
          }}
        >
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  allow,
  children,
  fallback,
}: {
  allow: (roles: Role[]) => boolean;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const { roles } = useAuth();
  if (roles.length === 0) return null;
  return allow(roles) ? <>{children}</> : <>{fallback}</>;
}
