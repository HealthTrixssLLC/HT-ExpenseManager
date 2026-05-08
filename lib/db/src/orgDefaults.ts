/**
 * Canonical "factory" defaults for a freshly-provisioned org.
 *
 * Two callers depend on this module so a system reset and a brand-new org
 * leave each tenant in identical starting state:
 *
 *   1. The standalone `pnpm --filter @workspace/scripts run seed` script,
 *      which wipes the entire DB and re-creates a demo org from scratch.
 *   2. The `system reset` service (Task #41), which iterates every org and
 *      re-seeds GL mappings + policy rules after wiping their operational
 *      data.
 *
 * Keep the literals in this file — never inline them at the call site —
 * so a single edit propagates everywhere. This file lives in `@workspace/db`
 * (the only workspace package both callers already depend on) so the shared
 * defaults import cleanly without a new package.
 */
import type { InsertGlMapping } from "./schema/glMappings";
import type { InsertPolicyRule } from "./schema/policyRules";

/**
 * The 12 employee-facing expense categories every org starts with. The
 * QBO-side `qboAccount` and `qboAccountId` are derived deterministically so
 * a seeded org's mappings are stable across re-runs.
 */
export const DEFAULT_GL_CATEGORIES = [
  "Travel:Airfare",
  "Travel:Lodging",
  "Travel:Ground Transportation",
  "Travel:Mileage",
  "Meals & Entertainment",
  "Office Supplies",
  "Software Subscriptions",
  "Continuing Education",
  "Conferences & Trade Shows",
  "Marketing & Advertising",
  "Telecommunications",
  "Professional Services",
] as const;

export type DefaultGlCategory = (typeof DEFAULT_GL_CATEGORIES)[number];

export function defaultGlMappingsFor(orgId: string): InsertGlMapping[] {
  return DEFAULT_GL_CATEGORIES.map((code) => ({
    orgId,
    code,
    qboAccount: `QBO:${code}`,
    qboAccountId: `acct-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    active: true,
  }));
}

/**
 * The three baseline policy knobs every org starts with.
 *
 * - `receipt_required_threshold` — single-line dollar amount above which a
 *   receipt must be attached. Stored as `{ amount: number }`.
 * - `meal_per_diem_max` — per-meal ceilings. Stored as
 *   `{ breakfast, lunch, dinner }`.
 * - `auto_post_after_finance_approval` — whether a finance-approved report
 *   posts to QBO automatically. Stored as `{ enabled: boolean }`.
 */
export type DefaultPolicyRule = {
  name: string;
  value: Record<string, unknown>;
  description: string;
};

export const DEFAULT_POLICY_RULES: ReadonlyArray<DefaultPolicyRule> = [
  {
    name: "receipt_required_threshold",
    value: { amount: 25 },
    description: "Receipt required for any single expense ≥ $25.",
  },
  {
    name: "meal_per_diem_max",
    value: { breakfast: 18, lunch: 22, dinner: 65 },
    description: "Per-diem ceilings for meals.",
  },
  {
    name: "auto_post_after_finance_approval",
    value: { enabled: false },
    description: "When true, automatically post to QBO without manual click.",
  },
];

export function defaultPolicyRulesFor(orgId: string): InsertPolicyRule[] {
  return DEFAULT_POLICY_RULES.map((rule) => ({
    orgId,
    name: rule.name,
    value: rule.value,
    description: rule.description,
  }));
}
