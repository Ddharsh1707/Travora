import type { ReactNode } from "react";
import { Archive, BarChart3, CircleHelp, Home as HomeIcon, LineChart, Upload, Bot, FileDown, FolderKanban, Gauge, Globe2, IndianRupee, UserSearch, Briefcase, ClipboardCheck, FileSpreadsheet, FileText, History, LayoutDashboard, Plane, Receipt, ScanLine, Search, UserCog, UsersRound } from "lucide-react";
import type { AuthUser, Role } from "../../lib/api";
import type { SupabaseAuthUser } from "../../lib/supabaseAuth";
import TravelSearch from "./TravelSearch";
import EmployeeDirectory from "./EmployeeDirectory";
import EmployeeHistory from "./EmployeeHistory";
import MyRequests from "./MyRequests";
import ApprovalQueue from "./ApprovalQueue";
import RequestsDesk from "./RequestsDesk";
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
import UploadHistory from "./UploadHistory";
import BiReports from "./BiReports";
import EmployeeDocuments from "./EmployeeDocuments";

/**
 * Supabase-backed travel screens (Phase 2). These routes only exist when
 * VITE_AUTH_PROVIDER=supabase. Role checks here decide what the UI offers;
 * the database still enforces every permission on its own.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// COMPANY_ADMIN is the "Admin": every travel desk permission plus all expenses
// and employee logins, below the CEO (ADMIN).
const STAFF: Role[] = ["TRAVEL_DESK", "COMPANY_ADMIN", "ADMIN"];
const OVERSIGHT: Role[] = ["APPROVER", "TRAVEL_DESK", "COMPANY_ADMIN", "ADMIN"];
const MANAGERS: Role[] = ["COMPANY_ADMIN", "ADMIN"];

type TravelRoute = { href: string; label: string; icon: ReactNode; roles: Role[]; group: string; hiddenFor?: Role[]; match?: string[] };

const CEO: Role[] = ["ADMIN"];
const ADMIN: Role[] = ["COMPANY_ADMIN"];

/**
 * Separate portals:
 *  - Employees get "MY WORKSPACE": they send travel requests and see their own
 *    decisions and trips. Nothing else.
 *  - The CEO (admin role) and the Admin (company_admin role) share one short
 *    menu: each job appears once. Screens that repeat another one (the old
 *    Reports page, Management overview, Employee Intelligence) stay reachable
 *    from links but are not in their menu (`hiddenFor`).
 * Managers and the travel desk keep their existing screens.
 */
const ROUTES: TravelRoute[] = [
  // Employee portal: describe the trip, see the decision, see your own trips
  { group: "MY WORKSPACE", href: "/travel/home", label: "My dashboard", icon: <LayoutDashboard size={16} />, roles: ["EMPLOYEE"] },
  { group: "MY WORKSPACE", href: "/travel/overview", label: "Overview", icon: <LayoutDashboard size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/requests", label: "My travel requests", icon: <FileText size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/my", label: "My travel history", icon: <History size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/documents", label: "Tickets & documents", icon: <ScanLine size={16} />, roles: ["EMPLOYEE"] },
  { group: "MY WORKSPACE", href: "/travel/expenses", label: "My expenses", icon: <Receipt size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  // CEO and Admin: daily work
  { group: "CEO", href: "/travel/ceo", label: "Dashboard", icon: <LayoutDashboard size={16} />, roles: CEO },
  { group: "ADMIN", href: "/travel/admin", label: "Dashboard", icon: <LayoutDashboard size={16} />, roles: ADMIN },
  { group: "CEO", href: "/travel/approvals", label: "Travel requests", icon: <ClipboardCheck size={16} />, roles: CEO },
  { group: "ADMIN", href: "/travel/approvals", label: "Travel requests", icon: <ClipboardCheck size={16} />, roles: ADMIN },
  { group: "CEO", href: "/travel/expenses/all", label: "Expenses", icon: <Receipt size={16} />, roles: CEO },
  { group: "ADMIN", href: "/travel/expenses/all", label: "Expenses", icon: <Receipt size={16} />, roles: ADMIN },
  { group: "CEO", href: "/travel/people", label: "Employees", icon: <UsersRound size={16} />, roles: CEO, match: ["/travel/employees"] },
  { group: "ADMIN", href: "/travel/people", label: "Employees", icon: <UsersRound size={16} />, roles: ADMIN, match: ["/travel/employees"] },
  { group: "CEO", href: "/travel/assistant", label: "AI assistant", icon: <Bot size={16} />, roles: CEO },
  { group: "ADMIN", href: "/travel/assistant", label: "AI assistant", icon: <Bot size={16} />, roles: ADMIN },
  // CEO and Admin: getting data in
  { group: "UPLOADS & BOOKINGS", href: "/travel/import", label: "Upload Excel / PDF", icon: <FileSpreadsheet size={16} />, roles: ["COMPANY_ADMIN", "ADMIN"] },
  { group: "UPLOADS & BOOKINGS", href: "/travel/uploads", label: "Upload history", icon: <Archive size={16} />, roles: ["COMPANY_ADMIN", "ADMIN"] },
  { group: "UPLOADS & BOOKINGS", href: "/travel/bulk", label: "Bulk bookings", icon: <Plane size={16} />, roles: ["COMPANY_ADMIN", "ADMIN"] },
  { group: "UPLOADS & BOOKINGS", href: "/travel/documents", label: "Tickets & documents", icon: <ScanLine size={16} />, roles: ["COMPANY_ADMIN", "ADMIN"] },
  // Business Intelligence: built only from recorded bookings; approvers see their team
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi", label: "Management overview", icon: <Gauge size={16} />, roles: OVERSIGHT, hiddenFor: MANAGERS },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/projects", label: "Project Intelligence", icon: <FolderKanban size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/travel", label: "Travel Intelligence", icon: <Globe2 size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/employees", label: "Employee Intelligence", icon: <UserSearch size={16} />, roles: OVERSIGHT, hiddenFor: MANAGERS },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/finance", label: "Financial Intelligence", icon: <IndianRupee size={16} />, roles: OVERSIGHT },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/search", label: "Search all trips", icon: <Search size={16} />, roles: MANAGERS },
  { group: "BUSINESS INTELLIGENCE", href: "/travel/bi/reports", label: "Download reports", icon: <FileDown size={16} />, roles: OVERSIGHT },
  // CEO and Admin: same job as another menu item, so reachable by link only
  { group: "CEO", href: "/travel/employees", label: "Employees: spend & history", icon: <UsersRound size={16} />, roles: MANAGERS, hiddenFor: MANAGERS },
  { group: "CEO", href: "/travel/reports", label: "Reports", icon: <BarChart3 size={16} />, roles: MANAGERS, hiddenFor: MANAGERS },
  // Travel desk: upload the employee travel sheet, then see its report and each employee's history
  { group: "TRAVEL DESK", href: "/travel/import", label: "Upload Excel / PDF", icon: <FileSpreadsheet size={16} />, roles: ["TRAVEL_DESK"] },
  { group: "TRAVEL DESK", href: "/travel/uploads", label: "Upload history", icon: <Archive size={16} />, roles: ["TRAVEL_DESK"] },
  { group: "TRAVEL DESK", href: "/travel/employees", label: "Employee travel history", icon: <UsersRound size={16} />, roles: ["TRAVEL_DESK"] },
  { group: "MY WORKSPACE", href: "/travel/approvals", label: "Approvals", icon: <ClipboardCheck size={16} />, roles: ["APPROVER"] },
  { group: "MY WORKSPACE", href: "/travel/reports", label: "My reports", icon: <BarChart3 size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  // Travel tools
  { group: "TRAVEL", href: "/travel/search", label: "Search all trips", icon: <Search size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  { group: "TRAVEL", href: "/travel/employees", label: "Employee travel", icon: <UsersRound size={16} />, roles: ["APPROVER"] },
  { group: "TRAVEL", href: "/travel/bulk", label: "Bulk & group bookings", icon: <Plane size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  { group: "TRAVEL", href: "/travel/documents", label: "Tickets & documents", icon: <ScanLine size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
  { group: "TRAVEL", href: "/travel/assistant", label: "Ask the assistant", icon: <Bot size={16} />, roles: ["APPROVER", "TRAVEL_DESK"] },
];

/** Where each role lands after signing in. */
export function travelHomeFor(role: Role): string {
  if (role === "EMPLOYEE") return "/travel/home";
  if (role === "COMPANY_ADMIN") return "/travel/admin";
  if (role === "ADMIN" || role === "PLATFORM_ADMIN") return "/travel/ceo";
  return "/travel/overview";
}

export const travelPageMeta: Record<string, { eyebrow: string; title: string; description?: string }> = {
  "/travel/overview": { eyebrow: "Travel", title: "Overview" },
  "/travel/home": { eyebrow: "Employee", title: "My dashboard" },
  "/travel/expenses": { eyebrow: "Employee", title: "My expenses" },
  "/travel/ceo": { eyebrow: "CEO", title: "CEO dashboard" },
  "/travel/admin": { eyebrow: "Admin", title: "Admin dashboard" },
  "/travel/people": { eyebrow: "Management", title: "Employees" },
  "/travel/expenses/all": { eyebrow: "Management", title: "Expenses" },
  "/travel/uploads": { eyebrow: "Travel desk", title: "Upload history" },
  "/travel/reports": { eyebrow: "Travel", title: "Reports" },
  "/travel/assistant": { eyebrow: "Travel", title: "Ask the assistant" },
  "/travel/my": { eyebrow: "Travel", title: "My travel history" },
  "/travel/requests": { eyebrow: "Travel", title: "My requests" },
  "/travel/approvals": { eyebrow: "Travel", title: "Travel requests" },
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

type NavItem = { label: string; href: string; icon: ReactNode; match?: string[] };

export function travelNavCategories(role: Role): { category: string; items: NavItem[] }[] {
  const groups: { category: string; items: NavItem[] }[] = [];
  const seen = new Set<string>();
  for (const r of ROUTES) {
    if (!r.roles.includes(role) || r.hiddenFor?.includes(role) || seen.has(r.href)) continue;
    seen.add(r.href);
    let g = groups.find((x) => x.category === r.group);
    if (!g) { g = { category: r.group, items: [] }; groups.push(g); }
    g.items.push({ href: r.href, label: r.label, icon: r.icon, match: r.match });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Icon rail (the slim sidebar). Each section is one icon with its name under
// it; a section with several pages opens a fly-out menu, and an entry with
// children opens a second fly-out (marked with an arrow).
// ---------------------------------------------------------------------------
export type RailLink = { label: string; href: string; match?: string[] };
export type RailEntry = RailLink | { label: string; children: RailLink[] };
export type RailSection = { key: string; label: string; icon: ReactNode; entries: RailEntry[] };

const SUPPORT: RailLink = { label: "Support", href: "/employee/support" };
const HELP: RailSection = { key: "help", label: "Help", icon: <CircleHelp size={19} />, entries: [SUPPORT] };

export function railLinks(e: RailEntry): RailLink[] {
  return "children" in e ? e.children : [e];
}

export function isRailLinkActive(l: RailLink, path: string): boolean {
  if (path === l.href || l.match?.includes(path)) return true;
  // Detail pages (one employee, one upload, one project) light up their list.
  const rest = path.startsWith(`${l.href}/`) ? path.slice(l.href.length + 1) : "";
  return rest !== "" && (UUID.test(rest) || rest === "unassigned");
}

const CATEGORY_RAIL: Record<string, { label: string; icon: ReactNode }> = {
  "MY WORKSPACE": { label: "My work", icon: <HomeIcon size={19} /> },
  "TRAVEL DESK": { label: "Desk", icon: <FileSpreadsheet size={19} /> },
  "BUSINESS INTELLIGENCE": { label: "Insights", icon: <LineChart size={19} /> },
  TRAVEL: { label: "Travel", icon: <Plane size={19} /> },
};

export function travelRail(role: Role): RailSection[] {
  const keep = (sections: RailSection[]) => sections
    .map((s) => ({
      ...s,
      entries: s.entries
        .map((e): RailEntry | null => {
          if ("children" in e) {
            const children = e.children.filter((c) => isTravelPathAllowed(role, c.href));
            return children.length ? { label: e.label, children } : null;
          }
          return e.href === SUPPORT.href || isTravelPathAllowed(role, e.href) ? e : null;
        })
        .filter((e): e is RailEntry => e !== null),
    }))
    .filter((s) => s.entries.length > 0);

  if (MANAGERS.includes(role)) {
    return keep([
      { key: "home", label: "Home", icon: <HomeIcon size={19} />, entries: [{ label: "Dashboard", href: travelHomeFor(role) }] },
      { key: "requests", label: "Requests", icon: <ClipboardCheck size={19} />, entries: [{ label: "Travel requests", href: "/travel/approvals" }] },
      { key: "expenses", label: "Expenses", icon: <Receipt size={19} />, entries: [{ label: "Expenses", href: "/travel/expenses/all" }] },
      { key: "people", label: "People", icon: <UsersRound size={19} />, entries: [
        { label: "Manage & logins", href: "/travel/people" },
        { label: "Spend & history", href: "/travel/employees" },
      ] },
      { key: "uploads", label: "Uploads", icon: <Upload size={19} />, entries: [
        { label: "Upload Excel / PDF", href: "/travel/import" },
        { label: "Upload history", href: "/travel/uploads" },
        { label: "Bulk bookings", href: "/travel/bulk" },
        { label: "Tickets & documents", href: "/travel/documents" },
      ] },
      { key: "insights", label: "Insights", icon: <LineChart size={19} />, entries: [
        { label: "Intelligence", children: [
          { label: "Projects", href: "/travel/bi/projects" },
          { label: "Travel", href: "/travel/bi/travel" },
          { label: "Finance", href: "/travel/bi/finance" },
        ] },
        { label: "Search all trips", href: "/travel/search" },
        { label: "Download reports", href: "/travel/bi/reports" },
      ] },
      { key: "assistant", label: "AI", icon: <Bot size={19} />, entries: [{ label: "AI assistant", href: "/travel/assistant" }] },
      HELP,
    ]);
  }
  if (role === "EMPLOYEE") {
    return keep([
      { key: "home", label: "Home", icon: <HomeIcon size={19} />, entries: [{ label: "My dashboard", href: "/travel/home" }] },
      { key: "requests", label: "Requests", icon: <FileText size={19} />, entries: [{ label: "My travel requests", href: "/travel/requests" }] },
      { key: "history", label: "History", icon: <History size={19} />, entries: [{ label: "My travel history", href: "/travel/my" }] },
      { key: "documents", label: "Tickets", icon: <ScanLine size={19} />, entries: [{ label: "Tickets & documents", href: "/travel/documents" }] },
      HELP,
    ]);
  }
  // Approvers and the travel desk: one rail section per menu group.
  const sections: RailSection[] = travelNavCategories(role).map((g) => ({
    key: g.category,
    label: CATEGORY_RAIL[g.category]?.label ?? g.category.charAt(0) + g.category.slice(1).toLowerCase(),
    icon: CATEGORY_RAIL[g.category]?.icon ?? <LayoutDashboard size={19} />,
    entries: g.items.map((i) => ({ label: i.label, href: i.href, match: i.match })),
  }));
  return [...sections, HELP];
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
    return <EmployeeHistory key={employeeMatch[1]} employeeId={employeeMatch[1]} canManage={canManage} canGiveLogin={MANAGERS.includes(user.role)} showBack />;
  }
  const uploadMatch = path.match(/^\/travel\/uploads\/([^/]+)$/);
  if (uploadMatch && UUID.test(uploadMatch[1])) {
    return canManage ? <UploadReport key={uploadMatch[1]} batchId={uploadMatch[1]} /> : null;
  }
  const isCeo = user.role === "ADMIN";
  const isManager = MANAGERS.includes(user.role);
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
      return <CeoDashboard name={name} profileId={profileId} isCeo />;
    case "/travel/admin":
      return <CeoDashboard name={name} profileId={profileId} isCeo={false} />;
    case "/travel/people":
      return isManager ? <PeopleManager profileId={profileId} isCeo={isCeo} /> : null;
    case "/travel/expenses/all":
      return isManager ? <AllExpenses profileId={profileId} isCeo={isCeo} /> : null;
    case "/travel/uploads":
      return canManage ? <UploadHistory /> : null;
    case "/travel/overview":
      return <Overview role={user.role} name={(user as SupabaseAuthUser).fullName ?? ""} />;
    case "/travel/reports":
      return <Reports scopeLabel={canManage ? "everyone" : user.role === "APPROVER" ? "you and your team" : "your own trips"} />;
    case "/travel/assistant":
      return <Assistant canSeeOthers={user.role !== "EMPLOYEE"} isManager={isManager} />;
    case "/travel/my":
      return <EmployeeHistory employeeId={profileId} canManage={false} showBack={false} />;
    case "/travel/requests":
      return <MyRequests profileId={profileId} />;
    case "/travel/approvals":
      return isManager ? <RequestsDesk profileId={profileId} isCeo={isCeo} /> : <ApprovalQueue profileId={profileId} />;
    case "/travel/search":
      return <TravelSearch canManage={canManage} canSeeOthers />;
    case "/travel/employees":
      return <EmployeeDirectory withExpenses={isManager} />;
    case "/travel/import":
      return canManage ? <ImportTravel isManager={user.role === "ADMIN" || user.role === "COMPANY_ADMIN"} /> : null;
    case "/travel/bulk":
      return <BulkBookings canManage={canManage} canReview={user.role === "APPROVER" || user.role === "ADMIN"} />;
    case "/travel/documents":
      return user.role === "EMPLOYEE" ? <EmployeeDocuments profileId={profileId} /> : <Documents profileId={profileId} canManage={canManage} />;
    default:
      return null;
  }
}
