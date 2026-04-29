/* Realistic seed data shared across mockups */

import type { WorkflowStatus } from "./types";

export const QB_CATEGORIES = [
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

export const DEPARTMENTS = [
  "Clinical Operations",
  "Revenue Cycle",
  "IT & Security",
  "Compliance",
  "Sales",
  "Executive",
] as const;

export type LineItem = {
  date: string;        // "Apr 22"
  merchant: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: "Personal Card" | "Cash" | "Company Card";
  hasReceipt: boolean;
  receipts?: number;
};

export type Report = {
  id: string;
  title: string;
  employee: string;
  department: string;
  period: string;
  total: number;
  status: WorkflowStatus;
  submitted: string;
  ageDays: number;
  lineCount: number;
  needsReceipt?: boolean;
};

export const SAMPLE_REPORTS: Report[] = [
  { id: "EXP-2604-118", title: "HIMSS 2026 Conference — Las Vegas",   employee: "Priya Raghavan",  department: "Clinical Operations", period: "Apr 14 — Apr 18, 2026", total: 2418.72, status: "Manager Review",       submitted: "Apr 19, 2026", ageDays: 10, lineCount: 9 },
  { id: "EXP-2604-117", title: "Site visit — Sacramento Memorial",     employee: "Marcus Chen",     department: "Revenue Cycle",       period: "Apr 21 — Apr 23, 2026", total: 612.40,  status: "Manager Review",       submitted: "Apr 24, 2026", ageDays: 5,  lineCount: 5 },
  { id: "EXP-2604-116", title: "Epic certification training",          employee: "Diane Okafor",    department: "IT & Security",       period: "Apr 06 — Apr 10, 2026", total: 1845.00, status: "Manager Approved",     submitted: "Apr 11, 2026", ageDays: 18, lineCount: 4 },
  { id: "EXP-2604-115", title: "Compliance audit prep — supplies",     employee: "Hannah Sørensen", department: "Compliance",          period: "Apr 12 — Apr 16, 2026", total: 287.16,  status: "Changes Requested",    submitted: "Apr 17, 2026", ageDays: 12, lineCount: 6, needsReceipt: true },
  { id: "EXP-2604-114", title: "Q2 sales kickoff — Austin",            employee: "Jordan Whitfield",department: "Sales",               period: "Mar 30 — Apr 02, 2026", total: 1962.55, status: "Finance Review",       submitted: "Apr 03, 2026", ageDays: 26, lineCount: 11 },
  { id: "EXP-2604-113", title: "Patient intake software pilot travel", employee: "Anika Bhatt",     department: "Clinical Operations", period: "Mar 23 — Mar 27, 2026", total: 1140.88, status: "Posted to QuickBooks", submitted: "Mar 28, 2026", ageDays: 32, lineCount: 7 },
  { id: "EXP-2604-112", title: "March client dinners",                 employee: "Wesley Park",     department: "Sales",               period: "Mar 04 — Mar 27, 2026", total: 824.10,  status: "Ready for Payroll Reimbursement", submitted: "Mar 28, 2026", ageDays: 32, lineCount: 5 },
  { id: "EXP-2604-111", title: "Healthcare CIO Summit — Boston",       employee: "Rosa Delacruz",   department: "Executive",           period: "Mar 16 — Mar 19, 2026", total: 3247.40, status: "Paid Through Payroll", submitted: "Mar 20, 2026", ageDays: 40, lineCount: 12 },
  { id: "EXP-2604-110", title: "Telehealth equipment for triage line", employee: "Marcus Chen",     department: "Revenue Cycle",       period: "Mar 09 — Mar 13, 2026", total: 489.62,  status: "Reconciled",            submitted: "Mar 14, 2026", ageDays: 46, lineCount: 3 },
];

export const HIMSS_LINES: LineItem[] = [
  { date: "Apr 14", merchant: "Delta Air Lines",          description: "SFO → LAS round-trip, main cabin",          category: "Travel:Airfare",            amount: 612.40, paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
  { date: "Apr 14", merchant: "Caesars Palace",           description: "Lodging · 4 nights · conference rate",       category: "Travel:Lodging",            amount: 1042.00,paymentMethod: "Personal Card", hasReceipt: true, receipts: 2 },
  { date: "Apr 14", merchant: "Lyft",                     description: "LAS airport → hotel",                         category: "Travel:Ground Transportation", amount: 38.20, paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
  { date: "Apr 15", merchant: "HIMSS Registration",       description: "Full conference badge · early bird",         category: "Conferences & Trade Shows", amount: 425.00, paymentMethod: "Company Card",  hasReceipt: true, receipts: 1 },
  { date: "Apr 15", merchant: "Jaleo Las Vegas",          description: "Dinner with 3 prospective customers",        category: "Meals & Entertainment",     amount: 184.62, paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
  { date: "Apr 16", merchant: "Starbucks",                description: "Breakfast · client meeting",                 category: "Meals & Entertainment",     amount: 22.85,  paymentMethod: "Personal Card", hasReceipt: false },
  { date: "Apr 16", merchant: "Wynn Business Center",     description: "Print of clinical workflow handouts",        category: "Office Supplies",           amount: 41.25,  paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
  { date: "Apr 17", merchant: "Uber",                     description: "Hotel → Venetian session · evening return",  category: "Travel:Ground Transportation", amount: 24.40, paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
  { date: "Apr 18", merchant: "Lyft",                     description: "Hotel → LAS airport",                         category: "Travel:Ground Transportation", amount: 28.00, paymentMethod: "Personal Card", hasReceipt: true, receipts: 1 },
];
