import type { ReactNode } from "react";
import { BarChart3, Bot, FileDown, FolderKanban, Gauge, Globe2, IndianRupee, UserSearch, Briefcase, ClipboardCheck, FileSpreadsheet, FileText, History, LayoutDashboard, Plane, Receipt, ScanLine, Search, UserCog, UsersRound } from "lucide-react";
import type { AuthUser, Role } from "../../lib/api";
import type { SupabaseAuthUser } from "../../lib/supabaseAuth";
import TravelSearch from "./TravelSearch";
import EmployeeDirectory from "./EmployeeDirectory";
import EmployeeHistory from "./EmployeeHistory";
import MyRequests from "./MyRequests";
import ApprovalQueue from "./ApprovalQueue";
import ImportTravel from "./ImportTravel";
import Documents from "./Documents";
import BulkBookings from "./BulkBookings";
import Reports from "./Reports";
import Overview from "./Overview";
import Assistant from "./Assistant";
import EmployeeHome from "./EmployeeHome";
import MyExpenses from "./MyExpenses";
import CeoDashboard from "./CeoDashboard";
import AllExpenses from "./AllExpenses";
import PeopleManager from "./PeopleManager";
import UploadReport from "./UploadReport";
import BiOverview from "./BiOverview";
import BiProjects from "./BiProjects";
import BiProjectDetail from "./BiProjectDetail";
import BiTravel from "./BiTravel";
import BiEmployees from "./BiEmployees";
import BiFinance from "./BiFinance";
import BiReports from "./BiReports";

/**
 * Supabase-backed travel screens (Phase 2). These routes only exist when
 * VITE_AUTH_PROVIDER=supabase. Role checks here decide what the UI offers;
 * the database still enforces every permission on its own.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF: Role[] = ["TRAVEL_DESK", "ADMIN"];
const OVERSIGHT: Role[] = ["APPROVER", "TRAVEL_DESK", "ADMIN"];

type TravelRoute = { href: string; label: string; icon: ReactNode; roles: Role[]; group: string };

const ALL: Role[] = ["EMPLOYEE", "APPROVER", "TRAVEL_DESK", "ADMIN"];
const CEO: Role[] = ["ADMIN"];

/**
 * Two separate portals:
 *  - Employees get "MY WORKSPACE": only their own trips, requests and expenses.
 *  - The CEO (admin role) gets "CEO" tools for the whole company, plus travel admin.
 * Managers and the travel desk keep their existing screens.
 */
const ROUTES: TravelRoute[] = [
  // Employee portal
  { group: "MY WORKSPACE", href: "/travel/home", label: "My dashboard", icon: <LayoutDashboard size={16} />, roles: ["EMPLOYEE"] },
  { group: "MY WORKSPACE", href: "/travel/overview", label: "Overview", icon: <LayoutDashboard size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/expenses", label: "My expenses", icon: <Receipt size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/requests", label: "My travel requests", icon: <FileText size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/my", label: "My travel history", icon: <History size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  // CEO portal
  { group: "CEO", href: "/travel/ceo", label: "CEO dashboard", icon: <Briefcase size={16} />, roles: CEO },
  { group: "CEO", href: "/travel/people", label: "Manage employees", icon: <UserCog size={16} />, roles: CEO },
  { group: "CEO", href: "/travel/expenses/all", label: "All expenses", icon: <Receipt size={16} />, roles: CEO },
  { group: "CEO", href: "/travel/approvals", label: "Travel approvals", icon: <ClipboardCheck size={16} />, roles: CEO },
  { group: "CEO", href: "/travel/reports", label: "Reports", icon: <BarChart3 size={16} />, roles: CEO },
  // Business Intelligence: built only from recorded bookings; approvers see their team
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi", label: "Management overview", icon: <Gauge size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/projects", label: "Project Intelligence", icon: <FolderKanban size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/travel", label: "Travel Intelligence", icon: <Globe2 size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/employees", label: "Employee Intelligence", icon: <UserSearch size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/finance", label: "Financial Intelligence", icon: <IndianRupee size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/reports", label: "Download reports", icon: <FileDown size={16} />, roles: OVERSIGHT },
  // Travel desk: upload the employee travel sheet, then see its report and each employee's history
  { group: "TRAVEL DESK", href: "/travel/import", label: "Upload travel data", icon: <FileSpreadsheet size={16} />, roles: STAFF },
  { group: "TRAVEL DESK", href: "/travel/employees", label: "Employee travel history", icon: <UsersRound size={16} />, roles: STAFF },
  { group: "MY WORKSPACE", href: "/travel/approvals", label: "Approvals", icon: <ClipboardCheck size={16} />, roles: ["APPROVER"] },
  { group: "MY WORKSPACE", href: "/travel/reports", label: "My reports", icon: <BarChart3 size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  // Travel tools
  { group: "TRAVEL", href: "/travel/search", label: "Search all trips", icon: <Search size={16} />, roles: OVERSIGHT },
  { group: "TRAVEL", href: "/travel/employees", label: "Employee travel", icon: <UsersRound size={16} />, roles: ["APPROVER"] },
  { group: "TRAVEL", href: "/travel/bulk", label: "Bulk & group bookings", icon: <Plane size={16} />, roles: OVERSIGHT },
  { group: "TRAVEL", href: "/travel/documents", label: "Tickets & documents", icon: <ScanLine size={16} />, roles: ALL },
  { group: "TRAVEL", href: "/travel/assistant", label: "Ask the assistant", icon: <Bot size={16} />, roles: ALL },
];

/** Where each role lands after signing in. */
export function travelHomeFor(role: Role): string {
  if (role === "EMPLOYEE") return "/travel/home";
  if (role === "ADMIN" || role === "COMPANY_ADMIN" || role === "PLATFORM_ADMIN") return "/travel/ceo";
  return "/travel/overview";
}

export const travelPageMeta: Record<string, { eyebrow: string; title: string; description?: string }> = {
  "/travel/overview": { eyebrow: "Travel", title: "Overview" },
  "/travel/home": { eyebrow: "Employee", title: "My dashboard" },
  "/travel/expenses": { eyebrow: "Employee", title: "My expenses" },
  "/travel/ceo": { eyebrow: "CEO", title: "CEO dashboard" },
  "/travel/people": { eyebrow: "CEO", title: "Manage employees" },
  "/travel/expenses/all": { eyebrow: "CEO", title: "All expenses" },
  "/travel/reports": { eyebrow: "Travel", title: "Reports" },
  "/travel/assistant": { eyebrow: "Travel", title: "Ask the assistant" },
  "/travel/my": { eyebrow: "Travel", title: "My travel history" },
  "/travel/requests": { eyebrow: "Travel", title: "My requests" },
  "/travel/approvals": { eyebrow: "Travel", title: "Approvals" },
  "/travel/search": { eyebrow: "Travel", title: "Travel search" },
  "/travel/employees": { eyebrow: "Travel", title: "Employees" },
  "/travel/import": { eyebrow: "Travel desk", title: "Upload travel data" },
  "/travel/documents": { eyebrow: "Travel", title: "Tickets & documents" },
  "/travel/bulk": { eyebrow: "Travel", title: "Bulk & group bookings" },
  "/travel/bi": { eyebrow: "Business Intelligence", title: "Management overview" },
  "/travel/bi/projects": { eyebrow: "Business Intelligence", title: "Project Intelligence" },
  "/travel/bi/travel": { eyebrow: "Business Intelligence", title: "Travel Intelligence" },
  "/travel/bi/employees": { eyebrow: "Business Intelligence", title: "Employee Intelligence" },
  "/travel/bi/finance": { eyebrow: "Business Intelligence", title: "Financial Intelligence" },
  "/travel/bi/reports": { eyebrow: "Business Intelligence", title: "Download reports" },
};

export function travelNavCategories(role: Role): { category: string; items: { label: string; href: string; icon: ReactNode }[] }[] {
  const groups: { category: string; items: { label: string; href: string; icon: ReactNode }[] }[] = [];
  for (const r of ROUTES) {
    if (!r.roles.includes(role)) continue;
    let g = groups.find((x) => x.category === r.group);
    if (!g) { g = { category: r.group, items: [] }; groups.push(g); }
    g.items.push({ href: r.href, label: r.label, icon: r.icon });
  }
  return groups;
}

export function isTravelPathAllowed(role: Role, path: string): boolean {
  const employeeMatch = path.match(/^\/travel\/employees\/([^/]+)$/);
  if (employeeMatch) return OVERSIGHT.includes(role) && UUID.test(employeeMatch[1]);
  const uploadMatch = path.match(/^\/travel\/uploads\/([^/]+)$/);
  if (uploadMatch) return STAFF.includes(role) && UUID.test(uploadMatch[1]);
  const projectMatch = path.match(/^\/travel\/bi\/projects\/([^/]+)$/);
  if (projectMatch) return OVERSIGHT.includes(role) && (projectMatch[1] === "unassigned" || UUID.test(projectMatch[1]));
  return ROUTES.some((r) => r.href === path && r.roles.includes(role));
}

export function TravelPage({ path, user }: { path: string; user: AuthUser }) {
  const profileId = (user as SupabaseAuthUser).profileId;
  const canManage = STAFF.includes(user.role);
  if (!profileId) return null;

  const employeeMatch = path.match(/^\/travel\/employees\/([^/]+)$/);
  if (employeeMatch && UUID.test(employeeMatch[1])) {
    return <EmployeeHistory key={employeeMatch[1]} employeeId={employeeMatch[1]} canManage={canManage} showBack />;
  }
  const uploadMatch = path.match(/^\/travel\/uploads\/([^/]+)$/);
  if (uploadMatch && UUID.test(uploadMatch[1])) {
    return canManage ? <UploadReport key={uploadMatch[1]} batchId={uploadMatch[1]} /> : null;
  }
  const isCeo = user.role === "ADMIN";
  const projectMatch = path.match(/^\/travel\/bi\/projects\/([^/]+)$/);
  if (projectMatch && (projectMatch[1] === "unassigned" || UUID.test(projectMatch[1]))) {
    const id = projectMatch[1] === "unassigned" ? null : projectMatch[1];
    return OVERSIGHT.includes(user.role) ? <BiProjectDetail key={projectMatch[1]} projectId={id} isCeo={isCeo} /> : null;
  }
  const name = (user as SupabaseAuthUser).fullName ?? "";
  const biScope = canManage ? "the whole company" : "you and your team";
  switch (path) {
    case "/travel/bi":
      return OVERSIGHT.includes(user.role) ? <BiOverview scopeLabel={biScope} /> : null;
    case "/travel/bi/projects":
      return OVERSIGHT.includes(user.role) ? <BiProjects isCeo={isCeo} /> : null;
    case "/travel/bi/travel":
      return OVERSIGHT.includes(user.role) ? <BiTravel canLink={canManage} /> : null;
    case "/travel/bi/employees":
      return OVERSIGHT.includes(user.role) ? <BiEmployees scopeLabel={biScope} /> : null;
    case "/travel/bi/finance":
      return OVERSIGHT.includes(user.role) ? <BiFinance /> : null;
    case "/travel/bi/reports":
      return OVERSIGHT.includes(user.role) ? <BiReports scopeLabel={biScope} /> : null;
    case "/travel/home":
      return <EmployeeHome name={name} profileId={profileId} />;
    case "/travel/expenses":
      return <MyExpenses profileId={profileId} />;
    case "/travel/ceo":
      return <CeoDashboard name={name} profileId={profileId} />;
    case "/travel/people":
      return <PeopleManager profileId={profileId} />;
    case "/travel/expenses/all":
      return <AllExpenses profileId={profileId} />;
    case "/travel/overview":
      return <Overview role={user.role} name={(user as SupabaseAuthUser).fullName ?? ""} />;
    case "/travel/reports":
      return <Reports scopeLabel={canManage ? "everyone" : user.role === "APPROVER" ? "you and your team" : "your own trips"} />;
    case "/travel/assistant":
      return <Assistant canSeeOthers={user.role !== "EMPLOYEE"} />;
    case "/travel/my":
      return <EmployeeHistory employeeId={profileId} canManage={false} showBack={false} />;
    case "/travel/requests":
      return <MyRequests profileId={profileId} />;
    case "/travel/approvals":
      return <ApprovalQueue profileId={profileId} />;
    case "/travel/search":
      return <TravelSearch canManage={canManage} canSeeOthers />;
    case "/travel/employees":
      return <EmployeeDirectory />;
    case "/travel/import":
      return canManage ? <ImportTravel /> : null;
    case "/travel/bulk":
      return <BulkBookings canManage={canManage} canReview={user.role === "APPROVER" || user.role === "ADMIN"} />;
    case "/travel/documents":
      return <Documents profileId={profileId} canManage={canManage} />;
    default:
      return null;
  }
}
