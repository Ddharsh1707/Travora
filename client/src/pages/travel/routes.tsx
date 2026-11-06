import type { ReactNode } from "react";
import { ClipboardCheck, FileSpreadsheet, FileText, History, ScanLine, Search, UsersRound } from "lucide-react";
import type { AuthUser, Role } from "../../lib/api";
import type { SupabaseAuthUser } from "../../lib/supabaseAuth";
import TravelSearch from "./TravelSearch";
import EmployeeDirectory from "./EmployeeDirectory";
import EmployeeHistory from "./EmployeeHistory";
import MyRequests from "./MyRequests";
import ApprovalQueue from "./ApprovalQueue";
import ImportTravel from "./ImportTravel";
import Documents from "./Documents";

/**
 * Supabase-backed travel screens (Phase 2). These routes only exist when
 * VITE_AUTH_PROVIDER=supabase. Role checks here decide what the UI offers;
 * the database still enforces every permission on its own.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF: Role[] = ["TRAVEL_DESK", "ADMIN"];
const OVERSIGHT: Role[] = ["APPROVER", "TRAVEL_DESK", "ADMIN"];

type TravelRoute = { href: string; label: string; icon: ReactNode; roles: Role[] };

const ROUTES: TravelRoute[] = [
  { href: "/travel/my", label: "My travel history", icon: <History size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK", "ADMIN"] },
  { href: "/travel/requests", label: "My requests", icon: <FileText size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK", "ADMIN"] },
  { href: "/travel/approvals", label: "Approvals", icon: <ClipboardCheck size={16} />, roles: ["APPROVER", "ADMIN"] },
  { href: "/travel/search", label: "Travel search", icon: <Search size={16} />, roles: OVERSIGHT },
  { href: "/travel/employees", label: "Employees", icon: <UsersRound size={16} />, roles: OVERSIGHT },
  { href: "/travel/import", label: "Excel / CSV import", icon: <FileSpreadsheet size={16} />, roles: STAFF },
  { href: "/travel/documents", label: "Tickets & documents", icon: <ScanLine size={16} />, roles: ["EMPLOYEE", "APPROVER", "TRAVEL_DESK", "ADMIN"] },
];

export const travelPageMeta: Record<string, { eyebrow: string; title: string; description?: string }> = {
  "/travel/my": { eyebrow: "Travel", title: "My travel history" },
  "/travel/requests": { eyebrow: "Travel", title: "My requests" },
  "/travel/approvals": { eyebrow: "Travel", title: "Approvals" },
  "/travel/search": { eyebrow: "Travel", title: "Travel search" },
  "/travel/employees": { eyebrow: "Travel", title: "Employees" },
  "/travel/import": { eyebrow: "Travel", title: "Excel / CSV import" },
  "/travel/documents": { eyebrow: "Travel", title: "Tickets & documents" },
};

export function travelNavCategory(role: Role): { category: string; items: { label: string; href: string; icon: ReactNode }[] } | null {
  const items = ROUTES.filter((r) => r.roles.includes(role)).map(({ href, label, icon }) => ({ href, label, icon }));
  return items.length ? { category: "TRAVEL RECORDS", items } : null;
}

export function isTravelPathAllowed(role: Role, path: string): boolean {
  const employeeMatch = path.match(/^\/travel\/employees\/([^/]+)$/);
  if (employeeMatch) return OVERSIGHT.includes(role) && UUID.test(employeeMatch[1]);
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
  switch (path) {
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
    case "/travel/documents":
      return <Documents profileId={profileId} canManage={canManage} />;
    default:
      return null;
  }
}
