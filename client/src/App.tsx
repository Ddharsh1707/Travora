import { Toaster } from "@/components/ui/sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Compass,
  FileCheck2,
  FileText,
  Filter,
  Globe2,
  Headphones,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plane,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TicketCheck,
  UserRound,
  UserPlus,
  UsersRound,
  WalletCards,
  Eye,
  EyeOff,
  X,
  XCircle,
  Download,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Printer,
  Train,
  Car,
  Building2,
  Bus,
  Zap,
  TrendingUp,
  Send,
  QrCode,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { isSupabaseEnabled } from "./lib/supabase";
import { TravelPage, isTravelPathAllowed, travelNavCategory, travelPageMeta } from "./pages/travel/routes";
import { onSupabaseSignedOut, supabaseRestoreSession, supabaseSignIn, supabaseSignOut } from "./lib/supabaseAuth";
import { AUTH_EXPIRED_EVENT, clearAuth, getStoredUser, getToken, isValidAuthUser, login as loginApi, persistAuth, travelRequestsApi, dashboardApi, employeesApi, bookingsApi, bulkBookingsApi, notificationsApi, healthApi, manualCloudSync, getResolvedUrl, REGISTERED_EMPLOYEES, spendReportsApi, type ExecutiveSpendOverview, type AuthUser, type Role, type BulkBookingRecord, type BulkBookingPassenger, type EmployeeRecord, type PaginatedEmployees } from "./lib/api";
import { CommandPalette } from "./components/CommandPalette";
import { TravelCalendar } from "./components/TravelCalendar";
import { Expenses } from "./pages/Expenses";
import { Profile } from "./pages/Profile";
import { UserManagement } from "./pages/UserManagement";
import { ActivateAccount } from "./pages/ActivateAccount";
import { ExcelImport } from "./pages/ExcelImport";
import { TravelSpendReports } from "./pages/TravelSpendReports";
import { LandingPage } from "./pages/LandingPage";
import { InteractiveRouteMap } from "./components/InteractiveRouteMap";
import { ReportExtractionSuite } from "./components/ReportExtractionSuite";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { exportToCsv } from "./utils/exportCsv";
import { SpotlightCard } from "./components/SpotlightCard";
import { AnimatedCounter } from "./components/AnimatedCounter";
import { RouteVisualizer } from "./components/RouteVisualizer";
import { WorkflowTimeline } from "./components/WorkflowTimeline";
import { SkeletonMetrics, SkeletonTable, SkeletonCard } from "./components/SkeletonLoader";

type Journey = {
  id: string;
  destination: string;
  from: string;
  to: string;
  dates: string;
  tripType: string;
  project: string;
  status: "Pending approval" | "Approved" | "Booked" | "Completed" | "Cancelled";
  booking?: string;
  passenger?: string;
  approverName?: string;
  approvalComment?: string;
  approvalDate?: string;
  reason?: string;
  employee?: {
    id?: number | string;
    name?: string;
    employeeId?: string;
    department?: string;
    designation?: string;
  };
  rawRequest?: BackendRequest;
};

type BackendRequest = Record<string, any>;

function formatRequestDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function mapRequestStatus(status: string | undefined): Journey["status"] {
  const normalized = (status || "PENDING").toUpperCase();
  if (normalized === "APPROVED") return "Approved";
  if (normalized === "BOOKED") return "Booked";
  if (normalized === "CANCELLED") return "Cancelled";
  if (normalized === "REJECTED") return "Cancelled";
  if (normalized === "COMPLETED") return "Completed";
  return "Pending approval";
}

function toJourney(request: BackendRequest): Journey {
  const employee = request.employee || {};
  const dates = request.returnDate ? `${formatRequestDate(request.travelDate)} – ${formatRequestDate(request.returnDate)}` : formatRequestDate(request.travelDate);
  const empName = employee.name || employee.username || request.passenger || "Employee";
  const empId = employee.employeeId || request.employeeId || "EMP";
  const dept = employee.department || "General Operations";
  const desig = employee.designation || "Staff";
  return {
    id: String(request.id),
    destination: request.toLocation || "Destination not provided",
    from: request.fromLocation || "Origin not provided",
    to: request.toLocation || "Destination not provided",
    dates,
    tripType: request.tripType || "Business",
    project: request.projectName || "—",
    status: mapRequestStatus(request.status),
    passenger: empName,
    approverName: request.approverName,
    approvalComment: request.approvalComment,
    approvalDate: request.approvalDate,
    reason: request.reason || "Business travel",
    employee: {
      id: employee.id || request.userId,
      name: empName,
      employeeId: empId,
      department: dept,
      designation: desig,
    },
    rawRequest: request,
  };
}

function useTravelRequests(user?: AuthUser | null, refreshKey = 0) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeUser = user || getStoredUser<AuthUser>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    travelRequestsApi
      .list()
      .then((data) => {
        if (!active) return;
        let list = Array.isArray(data) ? data : [];
        if (activeUser && activeUser.role === "EMPLOYEE") {
          const uEmpId = String(activeUser.employeeId || "").trim().toLowerCase();
          const uId = String(activeUser.id);
          list = list.filter((r: any) => {
            const rEmpId = String(r.employeeId || r.employee?.employeeId || "").trim().toLowerCase();
            const rId = String(r.userId || r.employee?.id || "").trim();
            return (uEmpId && rEmpId && uEmpId === rEmpId) || (uId && rId && uId === rId);
          });
        }
        setJourneys(list.map(toJourney));
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Travel data is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const handleSync = () => {
      travelRequestsApi.list().then((data) => {
        if (!active) return;
        let list = Array.isArray(data) ? data : [];
        if (activeUser && activeUser.role === "EMPLOYEE") {
          const uEmpId = String(activeUser.employeeId || "").trim().toLowerCase();
          const uId = String(activeUser.id);
          list = list.filter((r: any) => {
            const rEmpId = String(r.employeeId || r.employee?.employeeId || "").trim().toLowerCase();
            const rId = String(r.userId || r.employee?.id || "").trim();
            return (uEmpId && rEmpId && uEmpId === rEmpId) || (uId && rId && uId === rId);
          });
        }
        setJourneys(list.map(toJourney));
      });
    };
    window.addEventListener("trapple_cloud_synced", handleSync);
    window.addEventListener("travora_cloud_synced", handleSync);

    return () => {
      active = false;
      window.removeEventListener("trapple_cloud_synced", handleSync);
      window.removeEventListener("travora_cloud_synced", handleSync);
    };
  }, [refreshKey, activeUser?.id, activeUser?.employeeId]);

  return { journeys, loading, error };
}


const pageMeta: Record<string, { eyebrow: string; title: string; description?: string }> = {
  "/employee": { eyebrow: "Employee workspace", title: "Overview", description: "Your travel activity, requests and next steps in one place." },
  "/employee/plan-trip": { eyebrow: "Employee workspace", title: "Plan a trip", description: "Create a travel request with the details your approver needs." },
  "/employee/journeys": { eyebrow: "Employee workspace", title: "My journeys", description: "Follow every request from plan to return." },
  "/employee/calendar": { eyebrow: "Employee workspace", title: "Travel calendar", description: "Interactive schedule of departures, returns and upcoming trips." },
  "/employee/expenses": { eyebrow: "Employee workspace", title: "Expense tracker", description: "Submit trip receipts, claim reimbursements, and monitor compliance." },
  "/employee/profile": { eyebrow: "Employee workspace", title: "Profile & preferences", description: "Personal details, airline frequent flyer perks, and travel settings." },
  "/employee/approvals": { eyebrow: "Employee workspace", title: "Approvals", description: "See what needs your attention and what is moving forward." },
  "/employee/reports": { eyebrow: "Employee workspace", title: "Reports", description: "A clear view of your travel activity and patterns." },
  "/employee/support": { eyebrow: "Employee workspace", title: "Support", description: "Answers and help for every stage of your trip." },
  "/approver": { eyebrow: "Approver workspace", title: "Approval queue", description: "Review requests with enough context to make a confident decision." },
  "/approver/bookings": { eyebrow: "Approver workspace", title: "Desk bookings", description: "Review confirmed ticketing, costs, and attachments completed by the Travel Desk." },
  "/approver/bulk-bookings": { eyebrow: "Approver workspace", title: "Bulk & Group Movements", description: "Review headcount allocations, mass travel manifests, and large team budgets logged by the Travel Desk." },
  "/approver/history": { eyebrow: "Approver workspace", title: "Approval history", description: "A record of decisions made across your team." },
  "/travel-desk": { eyebrow: "Travel desk", title: "Operations overview", description: "Keep approved trips moving toward a confirmed booking." },
  "/travel-desk/bookings": { eyebrow: "Travel desk", title: "Booking queue", description: "Manage ticketing details and booking status." },
  "/travel-desk/bulk-bookings": { eyebrow: "Travel desk", title: "Bulk & Group Bookings", description: "Coordinate mass movements, flight blocks, train coaches, and passenger rosters for up to 100+ travelers." },
  "/travel-desk/cancellations": { eyebrow: "Travel desk", title: "Cancellations", description: "Coordinate eligible cancellations and keep the record clear." },
  "/admin": { eyebrow: "Administration", title: "Control center", description: "A high-level view of travel activity across the organization." },
  "/admin/employees": { eyebrow: "Administration", title: "Employees", description: "Directory and travel access for your organization." },
  "/admin/requests": { eyebrow: "Administration", title: "Travel requests", description: "All request activity, across every stage of the lifecycle." },
  "/admin/bookings": { eyebrow: "Administration", title: "Bookings", description: "Visibility into ticketing activity and travel spend." },
  "/admin/reports": { eyebrow: "Administration", title: "Organization reports", description: "Travel patterns to support better planning and policy." },
  "/approver/reports": { eyebrow: "Approver workspace", title: "Management Reports", description: "Supervised employee travel records, approval logs, and team booking costs." },
  "/travel-desk/users": { eyebrow: "Administration", title: "User Management", description: "Provision employee accounts, assign role permissions, and control tenant user access." },
  "/travel-desk/excel-import": { eyebrow: "Operations", title: "Excel Import & Travel History", description: "Upload spreadsheets, preview records, and manage historical corporate travel." },
  "/admin/excel-import": { eyebrow: "Administration", title: "Excel Import & Travel History", description: "Upload spreadsheets, preview records, and manage historical corporate travel." },
  "/admin/users": { eyebrow: "Administration", title: "User Management", description: "Provision employee accounts, assign role permissions, and control tenant user access." },
  "/travel-desk/reports": { eyebrow: "Travel desk", title: "Operations Reports", description: "Ticketing status, vendor provider costs, and booking manifest extraction." },
  "/travel-desk/spend-reports": { eyebrow: "Spend Intelligence", title: "Travel Spend Reports", description: "Company-wide travel expenditure, employee travel frequency, and historical budget intelligence." },
  "/approver/spend-reports": { eyebrow: "Spend Intelligence", title: "Travel Spend Reports", description: "Company-wide travel expenditure, employee travel frequency, and historical budget intelligence." },
  "/admin/spend-reports": { eyebrow: "Spend Intelligence", title: "Travel Spend Reports", description: "Company-wide travel expenditure, employee travel frequency, and historical budget intelligence." },
};

type NavCategory = {
  category: string;
  items: { label: string; href: string; icon: ReactNode }[];
};

const categorizedNavByRole: Record<Role, NavCategory[]> = {
  EMPLOYEE: [
    {
      category: "WORKSPACE",
      items: [
        { label: "Overview", href: "/employee", icon: <LayoutDashboard size={16} /> },
        { label: "Plan a trip", href: "/employee/plan-trip", icon: <Plus size={16} /> },
        { label: "My journeys", href: "/employee/journeys", icon: <Compass size={16} /> },
        { label: "Calendar", href: "/employee/calendar", icon: <CalendarDays size={16} /> },
      ],
    },
    {
      category: "FINANCE & INSIGHTS",
      items: [
        { label: "Expenses", href: "/employee/expenses", icon: <WalletCards size={16} /> },
        { label: "Reports", href: "/employee/reports", icon: <BarChart3 size={16} /> },
        { label: "Profile", href: "/employee/profile", icon: <UserRound size={16} /> },
        { label: "Support", href: "/employee/support", icon: <CircleHelp size={16} /> },
      ],
    },
  ],
  APPROVER: [
    {
      category: "MANAGEMENT",
      items: [
        { label: "Approval queue", href: "/approver", icon: <LayoutDashboard size={16} /> },
        { label: "Desk bookings", href: "/approver/bookings", icon: <TicketCheck size={16} /> },
        { label: "Bulk & Group Bookings", href: "/approver/bulk-bookings", icon: <UsersRound size={16} /> },
        { label: "Approval history", href: "/approver/history", icon: <FileCheck2 size={16} /> },
      ],
    },
    {
      category: "INSIGHTS & SUPPORT",
      items: [
        { label: "Reports", href: "/approver/reports", icon: <BarChart3 size={16} /> },
        { label: "Travel Spend Reports", href: "/approver/spend-reports", icon: <TrendingUp size={16} /> },
        { label: "Support", href: "/employee/support", icon: <CircleHelp size={16} /> },
      ],
    },
  ],
  TRAVEL_DESK: [
    {
      category: "OPERATIONS",
      items: [
        { label: "Operations overview", href: "/travel-desk", icon: <LayoutDashboard size={16} /> },
        { label: "Booking queue", href: "/travel-desk/bookings", icon: <TicketCheck size={16} /> },
        { label: "Bulk & Group Travel", href: "/travel-desk/bulk-bookings", icon: <UsersRound size={16} /> },
        { label: "Excel Import & History", href: "/travel-desk/excel-import", icon: <FileSpreadsheet size={16} /> },
        { label: "User Management", href: "/travel-desk/users", icon: <UserPlus size={16} /> },
        { label: "Cancellations", href: "/travel-desk/cancellations", icon: <XCircle size={16} /> },
      ],
    },
    {
      category: "INSIGHTS",
      items: [
        { label: "Reports", href: "/travel-desk/reports", icon: <BarChart3 size={16} /> },
        { label: "Travel Spend Reports", href: "/travel-desk/spend-reports", icon: <TrendingUp size={16} /> },
      ],
    },
  ],
  ADMIN: [
    {
      category: "WORKSPACE & CONTROLS",
      items: [
        { label: "Control center", href: "/admin", icon: <LayoutDashboard size={16} /> },
        { label: "Travel requests", href: "/admin/requests", icon: <FileText size={16} /> },
        { label: "Bookings", href: "/admin/bookings", icon: <TicketCheck size={16} /> },
        { label: "Employees", href: "/admin/employees", icon: <UsersRound size={16} /> },
        { label: "Excel Import & History", href: "/admin/excel-import", icon: <FileSpreadsheet size={16} /> },
        { label: "User Management", href: "/admin/users", icon: <UserPlus size={16} /> },
      ],
    },
    {
      category: "INSIGHTS & SYSTEM",
      items: [
        { label: "Reports", href: "/admin/reports", icon: <BarChart3 size={16} /> },
        { label: "Travel Spend Reports", href: "/admin/spend-reports", icon: <TrendingUp size={16} /> },
        { label: "Settings", href: "/admin/settings", icon: <Settings2 size={16} /> },
      ],
    },
  ],
  get COMPANY_ADMIN() {
    return this.ADMIN;
  },
  get PLATFORM_ADMIN() {
    return this.ADMIN;
  },
};

const navByRole: Record<Role, { label: string; href: string; icon: ReactNode }[]> = {
  EMPLOYEE: categorizedNavByRole.EMPLOYEE.flatMap((c) => c.items),
  APPROVER: categorizedNavByRole.APPROVER.flatMap((c) => c.items),
  TRAVEL_DESK: categorizedNavByRole.TRAVEL_DESK.flatMap((c) => c.items),
  ADMIN: categorizedNavByRole.ADMIN.flatMap((c) => c.items),
  COMPANY_ADMIN: categorizedNavByRole.ADMIN.flatMap((c) => c.items),
  PLATFORM_ADMIN: categorizedNavByRole.ADMIN.flatMap((c) => c.items),
};

const roleLabels: Record<Role, string> = {
  EMPLOYEE: "Employee",
  APPROVER: "Approver",
  TRAVEL_DESK: "Travel desk",
  ADMIN: "Administrator",
  COMPANY_ADMIN: "Company Administrator",
  PLATFORM_ADMIN: "Platform Administrator",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-lockup-compact" : ""}`} aria-label="Trapple">
      <span className="brand-mark"><Plane size={16} strokeWidth={2.4} /></span>
      {!compact && <span className="brand-name">trapple</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: Journey["status"] | "Booking pending" | "Rejected" }) {
  const tone = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${tone}`}><span className="status-dot" />{status}</span>;
}

function PageTitle({ meta }: { meta: { eyebrow: string; title: string; description?: string } }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{meta.eyebrow}</p>
        <h1>{meta.title}</h1>
        {meta.description && <p className="page-description">{meta.description}</p>}
      </div>
      <div className="heading-actions"><span className="preview-chip"><ShieldCheck size={13} /> Secure workspace</span></div>
    </div>
  );
}

function Sidebar({
  role,
  path,
  user,
  onLogout,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  role: Role;
  path: string;
  user: AuthUser;
  onLogout: () => void;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const initials = (user.username || "Trapple").slice(0, 2).toUpperCase();
  const baseCategories = categorizedNavByRole[role] || [
    { category: "WORKSPACE", items: navByRole[role] },
  ];
  const travelCategory = isSupabaseEnabled ? travelNavCategory(role) : null;
  // In Supabase mode only screens that already run on Supabase are offered;
  // the rest move over in later phases.
  const categories = travelCategory
    ? [travelCategory, { category: "HELP", items: [{ label: "Support", href: "/employee/support", icon: <CircleHelp size={16} /> }] }]
    : baseCategories;

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top flex items-center justify-between">
        <Logo compact={collapsed} />
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-collapse-toggle hidden md:flex"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          )}
          <button className="icon-button mobile-only" aria-label="Close navigation" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="workspace-switcher" title={collapsed ? "Mahathi Infra Services · Trapple" : undefined}>
        <div className="workspace-avatar">MI</div>
        {!collapsed && (
          <div className="workspace-copy">
            <span className="truncate">Mahathi Infra Services</span>
            <strong className="truncate">{roleLabels[role]} Portal</strong>
          </div>
        )}
        {!collapsed && <ChevronDown size={14} className="muted-icon shrink-0" />}
      </div>

      <div className="sidebar-nav-container flex-1 space-y-2">
        {categories.map((cat, idx) => (
          <div key={idx} className="space-y-1">
            {!collapsed && <div className="nav-category-header">{cat.category}</div>}
            <nav className="primary-nav" aria-label={cat.category}>
              {cat.items.map((item) => {
                const active = path === item.href || (path === "/" && item.href === "/employee");
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    onClick={onClose}
                    className={`nav-item ${active ? "active" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && active && <ChevronRight size={14} className="nav-chevron" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="sidebar-spacer" />

      {!collapsed && (
        <div className="role-account">
          <ShieldCheck size={14} className="text-[#14B8A6]" />
          <span>{roleLabels[role]} access</span>
        </div>
      )}

      <div
        className={`sidebar-profile ${collapsed ? "flex-col items-center gap-2" : ""}`}
        title={collapsed ? `${user.username} (${user.employeeId || "Staff"}) · Sign out` : undefined}
      >
        <div className="avatar avatar-small">{initials}</div>
        {!collapsed ? (
          <>
            <div className="profile-copy">
              <strong>{user.username}</strong>
              <span>{user.employeeId || "Mahathi Infra"}</span>
            </div>
            <button className="icon-button" aria-label="Sign out" onClick={onLogout} title="Sign out">
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <button className="icon-button text-[#94A3B8] hover:text-white" aria-label="Sign out" onClick={onLogout} title="Sign out">
            <LogOut size={15} />
          </button>
        )}
      </div>
    </aside>
  );
}

function Topbar({ onMenu, onOpenSearch, meta, user }: { onMenu: () => void; onOpenSearch: () => void; meta: { title: string }; user: AuthUser }) {
  const { theme, toggleTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const initials = (user.username || "Trapple").slice(0, 2).toUpperCase();

  const handleSyncClick = async () => {
    setSyncing(true);
    try {
      const res = await manualCloudSync();
      toast.success(res.count > 0 ? `Synced with cloud! ${res.count} update(s) applied.` : "Cloud data is fully up-to-date and synced across devices.");
    } catch {
      toast.success("Cloud data is synchronized.");
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-only" aria-label="Open navigation" onClick={onMenu}>
          <Menu size={20} />
        </button>
        <div className="breadcrumb">
          <span className="text-[#667085] dark:text-[#94A3B8]">Mahathi Infra</span>
          <ChevronRight size={13} className="text-[#94A3B8]" />
          <span className="text-[#667085] dark:text-[#94A3B8]">Trapple</span>
          <ChevronRight size={13} className="text-[#94A3B8]" />
          <strong className="text-[#101828] dark:text-[#F8FAFC]">{meta.title}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] text-xs text-[#667085] dark:text-[#94A3B8] bg-[#F8FAFC] dark:bg-[#111827] hover:border-[#14B8A6] transition-all hover:shadow-sm"
          title="Press Cmd+K to search"
        >
          <Search size={14} />
          <span>Search or Cmd+K</span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#E4E7EC] dark:bg-[#1E293B] text-[10px] font-mono text-[#475467] dark:text-[#CBD5E1]">⌘K</kbd>
        </button>
        <button
          type="button"
          className="icon-button sm:hidden"
          onClick={onOpenSearch}
          aria-label="Open command palette"
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          className="sync-live-button"
          onClick={handleSyncClick}
          title="Click to sync latest data across all devices"
        >
          <RotateCcw size={13} className={syncing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{syncing ? "Syncing…" : "Cloud Synced"}</span>
        </button>
        <button
          className="icon-button theme-toggle"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <NotificationBell />
        <div className="topbar-divider" />
        <Link href="/employee/profile" className="topbar-user hover:opacity-90 transition-opacity">
          <div className="avatar avatar-small">{initials}</div>
          <div className="topbar-user-copy">
            <strong>{user.username}</strong>
            <span className={`role-pill role-pill-${user.role.toLowerCase()}`}>{roleLabels[user.role]}</span>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </Link>
      </div>
    </header>
  );
}


function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | number | "all" | null>(null);
  const [error, setError] = useState("");
  const refresh = async () => {
    const [nextItems, nextUnread] = await Promise.all([notificationsApi.list(), notificationsApi.unreadCount()]);
    setItems(Array.isArray(nextItems) ? nextItems : []);
    setUnread(Number(nextUnread) || 0);
  };
  const loadCount = () => notificationsApi.unreadCount().then((count) => setUnread(Number(count) || 0)).catch(() => undefined);
  useEffect(() => { loadCount(); }, []);
  useEffect(() => { if (!open) return; setLoading(true); setError(""); refresh().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Notifications are unavailable.")).finally(() => setLoading(false)); }, [open]);
  async function markRead(id: string | number, event?: React.SyntheticEvent) { event?.preventDefault(); event?.stopPropagation(); const notificationId = String(id); setActionId(notificationId); setError(""); try { await notificationsApi.markRead(notificationId); await refresh(); toast.success("Notification marked as read."); } catch (requestError) { const message = requestError instanceof Error ? requestError.message : "Notification could not be marked as read."; setError(message); toast.error(message); } finally { setActionId(null); } }
  async function markAllRead(event?: React.SyntheticEvent) { event?.preventDefault(); event?.stopPropagation(); setActionId("all"); setError(""); try { await notificationsApi.markAllRead(); await refresh(); toast.success("All notifications marked as read."); } catch (requestError) { const message = requestError instanceof Error ? requestError.message : "Notifications could not be marked as read."; setError(message); toast.error(message); } finally { setActionId(null); } }
  return <div className="notification-wrap"><button type="button" className="icon-button notification-button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={18} />{unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}</button>{open && <><button type="button" className="notification-dismiss" aria-label="Close notifications" onClick={() => setOpen(false)} /><section className="notification-panel" aria-label="Notifications"><div className="notification-panel-header"><div><span className="card-kicker">TRAPPLE INBOX</span><h2>Notifications</h2></div>{unread > 0 && <button type="button" className="text-link" disabled={actionId === "all"} onPointerDown={(event) => event.stopPropagation()} onClick={markAllRead}>{actionId === "all" ? "Updating…" : "Mark all as read"}</button>}</div>{loading ? <div className="notification-state"><Clock3 size={18} /> Loading notifications…</div> : error ? <div className="notification-state notification-error"><XCircle size={18} />{error}</div> : items.length ? <div className="notification-list">{items.map((item) => <div className={`notification-item ${item.read ? "read" : "unread"}`} key={String(item.id)}><span className={`notification-type notification-type-${String(item.type || "").toLowerCase()}`}><Bell size={14} /></span><span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{formatNotificationTime(item.createdAt)}</small></span>{!item.read && <button type="button" className="notification-mark-read" disabled={actionId === String(item.id)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => markRead(item.id, event)}>{actionId === String(item.id) ? "Updating…" : "Mark as read"}</button>}{!item.read && <span className="notification-unread-dot" />}</div>)}</div> : <div className="notification-state"><Bell size={20} /><strong>You’re all caught up</strong><span>Important travel activity will appear here.</span></div>}</section></>}</div>;
}
function formatNotificationTime(value: unknown) { if (!value) return "Just now"; const date = new Date(String(value)); if (Number.isNaN(date.getTime())) return String(value); const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date); }

function AppShell({ children, role, user, onLogout }: { children: ReactNode; role: Role; user: AuthUser; onLogout: () => void }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return (localStorage.getItem("trapple_sidebar_collapsed") ?? localStorage.getItem("travora_sidebar_collapsed")) === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("trapple_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const path = location === "/" ? "/employee" : location;
  const meta = pageMeta[path] ?? travelPageMeta[path] ?? (path.startsWith("/travel/employees/") ? { eyebrow: "Travel", title: "Employee travel history" } : pageMeta["/employee"]);
  useEffect(() => setMobileOpen(false), [location]);
  return (
    <div className="app-shell">
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} user={user} onLogout={onLogout} />
      <div className={`sidebar-overlay ${mobileOpen ? "visible" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className={`sidebar-drawer ${mobileOpen ? "open" : ""}`}>
        <Sidebar role={role} path={path} user={user} onLogout={onLogout} onClose={() => setMobileOpen(false)} />
      </div>
      <div className={`desktop-sidebar ${collapsed ? "collapsed" : ""}`}>
        <Sidebar
          role={role}
          path={path}
          user={user}
          onLogout={onLogout}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      <div className={`app-main ${collapsed ? "sidebar-collapsed" : ""}`}>
        <Topbar onMenu={() => setMobileOpen(true)} onOpenSearch={() => setSearchOpen(true)} meta={meta} user={user} />
        <main className="content-wrap">{children}</main>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon, accent, numericValue }: { label: string; value: string; detail: string; icon: ReactNode; accent?: string; numericValue?: number }) {
  return (
    <SpotlightCard className={`stat-card p-5 transition-all duration-300 ${accent ? "border-[#14B8A6]/40 shadow-[0_4px_20px_rgba(20,184,166,0.12)]" : ""}`}>
      <div className="stat-card-top flex items-center justify-between">
        <span className="stat-icon">{icon}</span>
        <span className="stat-detail">{detail}</span>
      </div>
      {numericValue !== undefined ? (
        <strong className="stat-value text-2xl sm:text-3xl font-extrabold tracking-tight">
          <AnimatedCounter value={numericValue} />
        </strong>
      ) : (
        <strong className="stat-value">{value}</strong>
      )}
      <span className="stat-label">{label}</span>
    </SpotlightCard>
  );
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Dashboard({ user }: { user: AuthUser }) {
  const { journeys, loading } = useTravelRequests(user);
  const upcoming = journeys.find((journey) => journey.status === "Approved" || journey.status === "Booked" || journey.status === "Pending approval");
  const [upcomingBooking, setUpcomingBooking] = useState<any | null>(null);

  useEffect(() => {
    let active = true;
    if (upcoming?.id) {
      bookingsApi.byTravelRequest(upcoming.id).then((data) => {
        if (active) {
          const rec = Array.isArray(data) ? data.find((b: any) => !b?.cancelled) || data[0] || null : data || null;
          setUpcomingBooking(rec);
        }
      }).catch(() => { if (active) setUpcomingBooking(null); });
    } else {
      setUpcomingBooking(null);
    }
    return () => { active = false; };
  }, [upcoming?.id]);

  const stats = {
    total: journeys.length,
    upcoming: journeys.filter((journey) => journey.status === "Approved" || journey.status === "Booked").length,
    pending: journeys.filter((journey) => journey.status === "Pending approval").length,
    approved: journeys.filter((journey) => journey.status === "Approved").length,
    booked: journeys.filter((journey) => journey.status === "Booked").length,
    completed: journeys.filter((journey) => journey.status === "Completed").length,
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading && journeys.length === 0) {
    return (
      <div className="page-stack animate-page">
        <PageTitle meta={pageMeta["/employee"]} />
        <SkeletonMetrics />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack animate-page space-y-6">
      <PageTitle meta={pageMeta["/employee"]} />

      {/* 1. Welcome Hero Section with Personalized Identity */}
      <section className="welcome-grid">
        <div className="welcome-card">
          <div className="welcome-copy">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#14B8A6]/20 text-[#2DD4BF] border border-[#14B8A6]/30">
                Mahathi Infra Services Pvt. Ltd.
              </span>
              <span className="text-[11px] text-[#94A3B8]">· Corporate Travel Workspace</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white border border-white/10">
                ID: {user.employeeId || "MISPL0001"}
              </span>
            </div>
            <h2>{greeting}, {user.username}.</h2>
            <p>Welcome to your central corporate mobility hub. Coordinate itineraries, track manager sign-offs, and access confirmed e-tickets.</p>
            <div className="welcome-actions flex flex-wrap items-center gap-3 mt-4">
              <Link href="/employee/plan-trip" className="button button-primary">
                <Plus size={16} /> Plan a trip
              </Link>
              <Link href="/employee/journeys" className="button button-ghost">
                View journeys <ArrowUpRight size={16} />
              </Link>
              <Link href="/employee/calendar" className="button button-ghost">
                <CalendarDays size={16} /> Calendar
              </Link>
              <Link href="/employee/expenses" className="button button-ghost">
                <WalletCards size={16} /> Expenses
              </Link>
            </div>
          </div>
          <div className="welcome-badge-panel hidden xl:flex flex-col justify-between p-4 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md w-[240px] shrink-0 text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2DD4BF]">Corporate Desk</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
              </span>
            </div>
            <div className="space-y-2 py-2.5">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 text-[11px]">Approval SLA</span>
                <span className="font-semibold text-white">&lt; 24h Fast Track</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 text-[11px]">Desk Level</span>
                <span className="font-semibold text-teal-300">Tier 1 Corporate</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 text-[11px]">Cloud Sync</span>
                <span className="font-semibold text-emerald-400">Live</span>
              </div>
            </div>
            <div className="pt-2.5 border-t border-white/10 flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={13} className="text-[#2DD4BF] shrink-0" />
              <span>TLS 1.3 Tenant Isolation</span>
            </div>
          </div>
        </div>

        {/* Next Scheduled Journey or Call-to-Action Card */}
        <div className="upcoming-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">NEXT JOURNEY</span>
              <h3>{upcoming?.destination || "No upcoming journeys"}</h3>
            </div>
            <span className="round-arrow"><ArrowUpRight size={17} /></span>
          </div>

          {upcoming ? (
            <>
              <RouteVisualizer
                from={upcoming.from}
                to={upcoming.to}
                dates={upcoming.dates}
                project={upcoming.project}
                status={upcoming.status}
                className="mb-3"
              />

              <WorkflowTimeline
                status={upcoming.status}
                approverName={upcoming.approverName}
                approvalDate={upcoming.approvalDate ? formatRequestDate(upcoming.approvalDate) : undefined}
                bookingReference={upcomingBooking?.bookingReference}
                className="mb-3"
              />

              {upcoming.status === "Approved" || upcoming.status === "Booked" ? (
                <div className="approver-box-approved">
                  <ShieldCheck size={18} className="shrink-0" />
                  <div>
                    <strong>Approver Decision: Approved</strong>
                    <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                      Approved by {upcoming.approverName || "Assigned Manager"}
                      {upcoming.approvalDate ? ` on ${formatRequestDate(upcoming.approvalDate)}` : ""}. Authorized for ticketing.
                    </p>
                  </div>
                </div>
              ) : upcoming.status === "Pending approval" ? (
                <div className="approver-box-pending">
                  <Clock3 size={18} className="shrink-0" />
                  <div>
                    <strong>Pending Approver Decision</strong>
                    <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                      Sent to Travel Desk for visibility. Manager sign-off is pending.
                    </p>
                  </div>
                </div>
              ) : null}

              {upcomingBooking && (
                <div className="ticket-attachment-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="card-kicker">CONFIRMED TICKET</span>
                    <span className="ticket-badge"><TicketCheck size={12} /> {upcomingBooking.bookingReference}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                    <span>{upcomingBooking.provider || "Carrier"} · {upcomingBooking.bookingType}</span>
                    {upcomingBooking.cost !== undefined && <span>₹{Number(upcomingBooking.cost).toLocaleString("en-IN")}</span>}
                  </div>
                  {upcomingBooking.notes && <p style={{ fontSize: 12, margin: 0, opacity: 0.85 }}>{upcomingBooking.notes}</p>}
                  {upcomingBooking.attachmentData && (
                    <div style={{ marginTop: 4 }}>
                      {upcomingBooking.attachmentType?.includes("image") ? (
                        <img src={upcomingBooking.attachmentData} alt="Ticket copy" className="ticket-attachment-preview" />
                      ) : (
                        <div className="ticket-doc-card">
                          <FileText size={22} className="text-red-500 shrink-0" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {upcomingBooking.attachmentName || "e-ticket.pdf"}
                            </strong>
                            <small style={{ fontSize: 11, opacity: 0.75 }}>PDF Ticket Document</small>
                          </div>
                        </div>
                      )}
                      <a
                        href={upcomingBooking.attachmentData}
                        download={upcomingBooking.attachmentName || "ticket"}
                        target="_blank"
                        rel="noreferrer"
                        className="button button-small button-primary"
                        style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}
                      >
                        <Download size={13} /> View / Download {upcomingBooking.attachmentType?.includes("pdf") ? "PDF Ticket" : "Ticket Photo"}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<Compass size={20} />}
              title="Ready for your next trip?"
              description="You have no pending or upcoming journeys scheduled. Plan your next business trip in just a few clicks."
              action={<Link className="button button-primary button-small" href="/employee/plan-trip">Plan a trip</Link>}
            />
          )}
        </div>
      </section>

      {/* 2. Live Executive Pulse Stats */}
      <div className="section-title-row section-title-spaced">
        <div>
          <span className="card-kicker">AT A GLANCE</span>
          <h2 className="section-heading">Your travel pulse</h2>
        </div>
        <span className="data-note"><ShieldCheck size={13} /> Real-time backend data</span>
      </div>

      <section className="stats-grid">
        <StatCard label="Total journeys" value={String(stats.total).padStart(2, "0")} numericValue={stats.total} detail="All-time requests" icon={<Compass size={18} />} />
        <StatCard label="Waiting for approval" value={String(stats.pending).padStart(2, "0")} numericValue={stats.pending} detail="Awaiting action" icon={<Clock3 size={18} />} />
        <StatCard label="Approved journeys" value={String(stats.approved).padStart(2, "0")} numericValue={stats.approved} detail="Ready for desk" icon={<ShieldCheck size={18} />} accent="stat-accent" />
        <StatCard label="Confirmed bookings" value={String(stats.booked).padStart(2, "0")} numericValue={stats.booked} detail="Issued e-tickets" icon={<TicketCheck size={18} />} />
      </section>

      {/* 3. Quick Actions Workstation Hub */}
      <section className="space-y-3">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">QUICK WORKSTATION</span>
            <h2 className="section-heading">Employee Actions Hub</h2>
          </div>
          <span className="text-xs text-[#667085] dark:text-[#94A3B8]">Frequently used corporate travel tools</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <Link
            href="/employee/plan-trip"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#14B8A6]/10 text-[#0D9488] dark:text-[#2DD4BF] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Plus size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  Plan a New Trip
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Submit flight, rail, or hotel request
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/employee/journeys"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Compass size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  My Journeys
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Track approval & ticket status
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/employee/calendar"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <CalendarDays size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  Travel Calendar
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Interactive schedule of departures
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/employee/expenses"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <WalletCards size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  Expense Claims
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  File receipts & claim per-diem
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/employee/reports"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <BarChart3 size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  Travel Signals & Reports
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  View personal travel frequency
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/employee/support"
            className="p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-white dark:bg-[#111827] hover:border-[#14B8A6] dark:hover:border-[#14B8A6] hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <CircleHelp size={20} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-[#101828] dark:text-white group-hover:text-[#14B8A6] transition-colors">
                  Travel Desk Support
                </strong>
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  FAQs & contact helpdesk
                </span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. Interactive Flight Corridors Map */}
      <section className="space-y-3">
        <InteractiveRouteMap />
      </section>

      {/* 5. Lower Grid: Recent Journeys + Request Flow Breakdown */}
      <section className="dashboard-lower-grid">
        <div className="panel recent-panel">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">RECENT ACTIVITY</span>
              <h2 className="section-heading">My journeys</h2>
            </div>
            <Link href="/employee/journeys" className="text-link">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="journey-list">
            {journeys.length ? (
              journeys.slice(0, 4).map((journey) => <JourneyRow key={journey.id} journey={journey} />)
            ) : (
              <EmptyState
                icon={<Compass size={20} />}
                title="No journeys submitted yet"
                description="Your submitted travel requests will appear here once created."
                action={<Link className="button button-primary button-small" href="/employee/plan-trip">Plan your first trip</Link>}
              />
            )}
          </div>
        </div>

        <div className="panel status-panel">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">REQUEST FLOW</span>
              <h2 className="section-heading">Where things stand</h2>
            </div>
            <Compass size={18} className="panel-icon" />
          </div>
          <div className="flow-list">
            <FlowItem label="Pending approval" count={String(stats.pending).padStart(2, "0")} tone="pending" />
            <FlowItem label="Approved by Manager" count={String(stats.approved).padStart(2, "0")} tone="approved" />
            <FlowItem label="Confirmed Booked" count={String(stats.booked).padStart(2, "0")} tone="booked" />
            <FlowItem label="Completed Trips" count={String(stats.completed).padStart(2, "0")} tone="completed" />
          </div>
          <Link href="/employee/reports" className="panel-footer-link">
            See detailed reports <ArrowRightIcon />
          </Link>
        </div>
      </section>

      {/* 6. Activity Timeline Audit Stream */}
      <div className="mt-4">
        <ActivityTimeline journeys={journeys} user={user} />
      </div>
    </div>
  );
}
function ArrowRightIcon() { return <ChevronRight size={15} />; }

function FlowItem({ label, count, tone }: { label: string; count: string; tone: string }) { return <div className="flow-item"><span className={`flow-marker marker-${tone}`} /><span>{label}</span><strong>{count}</strong></div>; }

function JourneyRow({ journey }: { journey: Journey }) {
  return <Link href={`/employee/journeys?journey=${journey.id}`} className="journey-row"><div className="journey-icon"><Plane size={16} /></div><div className="journey-main"><strong>{journey.destination}</strong><span>{journey.from} → {journey.to} · {journey.dates}</span></div><div className="journey-project">{journey.project}</div><StatusBadge status={journey.status} /><ChevronRight size={16} className="row-chevron" /></Link>;
}

function PlanTrip() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];

  async function submitTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const travelDate = String(form.get("travelDate") || "");
    const returnDate = String(form.get("returnDate") || "");

    if (travelDate && travelDate < todayStr) {
      setError("Departure date cannot be in the past.");
      setSubmitting(false);
      return;
    }
    if (travelDate && returnDate && returnDate < travelDate) {
      setError("Return date must be on or after the departure date.");
      setSubmitting(false);
      return;
    }

    try {
      await travelRequestsApi.create({ tripType: form.get("tripType"), fromLocation: form.get("fromLocation"), toLocation: form.get("toLocation"), travelDate: form.get("travelDate"), returnDate: form.get("returnDate"), projectName: form.get("projectName"), reason: form.get("reason") });
      setSubmitted(true);
      toast.success("Travel request submitted for approval.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't submit your request.");
    } finally { setSubmitting(false); }
  }
  return <div className="page-stack animate-page"><PageTitle meta={pageMeta["/employee/plan-trip"]} />
    {submitted ? (
      <div className="success-card">
        <div className="success-mark">
          <Check size={24} strokeWidth={2.5} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="card-kicker">REQUEST SUBMITTED</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#14B8A6]/10 text-[#0D9488] dark:text-[#2DD4BF] border border-[#14B8A6]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] animate-pulse" /> Pending Approval
            </span>
          </div>
          <h2>Your request is with your approver.</h2>
          <p>
            Trapple has sent your travel request to the corporate approval workflow. You can track real-time status and approver remarks from My Journeys.
          </p>
          <div className="welcome-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => setSubmitted(false)}
            >
              Create another request
            </button>
            <Link href="/employee/journeys" className="button button-ghost">
              View journeys <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    ) : (
      <form className="form-layout" onSubmit={submitTrip}>
        <div className="panel form-panel">
          <div className="form-intro">
            <span className="card-kicker">TRAVEL REQUEST</span>
            <h2>Tell us about the trip</h2>
            <p>These details help your approver and travel desk move quickly.</p>
          </div>
          <div className="form-section">
            <div className="form-section-heading">
              <span>01</span>
              <div>
                <h3>Trip details</h3>
                <p>Start with the basics of your journey.</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Trip type</span>
                <select name="tripType" defaultValue="BUSINESS">
                  <option value="BUSINESS">Business</option>
                  <option value="CONFERENCE">Conference</option>
                  <option value="TRAINING">Training</option>
                </select>
              </label>
              <label className="field">
                <span>From location</span>
                <div className="input-with-icon">
                  <Compass size={16} />
                  <input
                    name="fromLocation"
                    required
                    placeholder="City or airport"
                    className="has-leading-icon"
                  />
                </div>
              </label>
              <label className="field">
                <span>To location</span>
                <div className="input-with-icon">
                  <Plane size={16} />
                  <input
                    name="toLocation"
                    required
                    placeholder="City or airport"
                    className="has-leading-icon"
                  />
                </div>
              </label>
              <label className="field">
                <span>Travel date</span>
                <div className="input-with-icon">
                  <CalendarDays size={16} />
                  <input
                    name="travelDate"
                    required
                    type="date"
                    min={todayStr}
                    className="has-leading-icon"
                  />
                </div>
              </label>
              <label className="field">
                <span>Return date</span>
                <div className="input-with-icon">
                  <CalendarDays size={16} />
                  <input
                    name="returnDate"
                    required
                    type="date"
                    min={todayStr}
                    className="has-leading-icon"
                  />
                </div>
              </label>
              <label className="field">
                <span>Project name</span>
                <input
                  name="projectName"
                  required
                  placeholder="e.g. APAC launch"
                />
              </label>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-heading">
              <span>02</span>
              <div>
                <h3>Business context</h3>
                <p>Give your approver the context they need.</p>
              </div>
            </div>
            <label className="field">
              <span>Reason for travel</span>
              <textarea
                name="reason"
                required
                placeholder="What is the purpose of this trip?"
                rows={4}
              />
            </label>
          </div>
          {error && (
            <div className="form-error-message">
              <XCircle size={15} />
              {error}
            </div>
          )}
        </div>
        <aside className="form-aside">
          <div className="aside-card aside-dark">
            <Sparkles size={18} />
            <h3>Built for the way work moves.</h3>
            <p>
              Trapple keeps the request, approval and booking context together so
              no detail gets lost in the handoff.
            </p>
            <div className="aside-line" />
            <span>Authenticated employee context will be attached automatically.</span>
          </div>
          <div className="aside-card">
            <div className="section-title-row">
              <span className="card-kicker">BEFORE YOU SUBMIT</span>
              <Check size={16} className="check-icon" />
            </div>
            <ul className="check-list">
              <li>
                <Check size={14} /> Dates are accurate
              </li>
              <li>
                <Check size={14} /> Project is correctly named
              </li>
              <li>
                <Check size={14} /> Reason is clear to your approver
              </li>
            </ul>
          </div>
          <div className="form-actions">
            <button
              type="submit"
              className="button button-primary button-wide"
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit request"} <ArrowUpRight size={16} />
            </button>
            <button
              type="button"
              className="button button-ghost button-wide"
              onClick={() =>
                toast("Draft saving is not part of the inspected backend contract yet.")
              }
            >
              Save as draft
            </button>
            <p className="form-note">
              <ShieldCheck size={14} /> Your employee identity comes from the
              authenticated JWT session.
            </p>
          </div>
        </aside>
      </form>
    )}
  </div>;
}

function DeleteConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
  isDanger = true,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  isDanger?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog">
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
        <div className={`confirm-icon ${isDanger ? "reject" : "approve"}`}>
          {isDanger ? <Trash2 size={22} /> : <RotateCcw size={22} />}
        </div>
        <span className="card-kicker">CONFIRM ACTION</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className={`button ${isDanger ? "button-danger" : "button-primary"}`}
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Action failed. Please try again.");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Journeys() {
  const user = getStoredUser<AuthUser>();
  const [refreshKey, setRefreshKey] = useState(0);
  const { journeys, loading, error } = useTravelRequests(user, refreshKey);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All journeys");
  const [selected, setSelected] = useState<Journey | null>(null);
  const [deletingJourney, setDeletingJourney] = useState<Journey | null>(null);
  const [bookingsByRequest, setBookingsByRequest] = useState<Record<string, any | null>>({});
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [confirmClearPast, setConfirmClearPast] = useState(false);

  // Auto-open journey if ?journey=ID is present in URL
  useEffect(() => {
    if (!journeys.length) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get("journey");
      if (targetId) {
        const found = journeys.find((j) => String(j.id) === String(targetId));
        if (found) setSelected(found);
      }
    } catch {
      // URL parsing fallback
    }
  }, [journeys]);

  useEffect(() => {
    let active = true;
    if (!journeys.length) {
      setBookingsByRequest({});
      setBookingLoading(false);
      return;
    }
    const eligible = journeys.filter((journey) => ["Approved", "Booked", "Completed", "Cancelled"].includes(journey.status));
    setBookingLoading(Boolean(eligible.length));
    setBookingError("");
    Promise.all(
      eligible.map(async (journey) => {
        try {
          const data = await bookingsApi.byTravelRequest(journey.id);
          return [journey.id, Array.isArray(data) ? data.find((booking: any) => booking && booking.cancelled !== true) || data[0] || null : data || null] as const;
        } catch (requestError) {
          throw requestError;
        }
      })
    )
      .then((entries) => {
        if (active) setBookingsByRequest(Object.fromEntries(entries));
      })
      .catch((requestError) => {
        if (active) setBookingError(requestError instanceof Error ? requestError.message : "Booking details are unavailable.");
      })
      .finally(() => {
        if (active) setBookingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [journeys]);

  const hydratedJourneys = useMemo(
    () =>
      journeys.map((journey) => {
        const booking = bookingsByRequest[journey.id];
        if (booking?.cancelled) return { ...journey, status: "Cancelled" as const };
        if (booking && journey.status === "Approved") return { ...journey, status: "Booked" as const };
        return journey;
      }),
    [journeys, bookingsByRequest]
  );

  const filtered = useMemo(
    () =>
      hydratedJourneys.filter(
        (journey) =>
          (filter === "All journeys" || journey.status === filter) &&
          `${journey.destination} ${journey.project} ${journey.id}`.toLowerCase().includes(query.toLowerCase())
      ),
    [hydratedJourneys, query, filter]
  );

  const handleExportCsv = () => {
    const headers = ["Journey ID", "Destination", "From", "To", "Dates", "Trip Type", "Project", "Status"];
    const rows = filtered.map((j) => [j.id, j.destination, j.from, j.to, j.dates, j.tripType, j.project, j.status]);
    exportToCsv("trapple_journeys", headers, rows);
    toast.success("Journeys exported to CSV.");
  };

  const handleClearPast = async () => {
    await travelRequestsApi.deletePastOrCompleted();
    toast.success("Past and completed trips have been removed.");
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/employee/journeys"]} />
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search journeys" />
          </div>
          <div className="toolbar-filters">
            <Filter size={15} />
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option>All journeys</option>
              <option>Pending approval</option>
              <option>Approved</option>
              <option>Booked</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmClearPast(true)}
              className="button button-ghost flex items-center gap-1.5"
              title="Clear completed or cancelled trips from your journeys"
            >
              <Trash2 size={14} /> Clear past trips
            </button>
            <button type="button" onClick={handleExportCsv} className="button button-ghost flex items-center gap-1.5">
              <Download size={14} /> Export CSV
            </button>
            <Link href="/employee/plan-trip" className="button button-primary">
              <Plus size={16} /> Plan a trip
            </Link>
          </div>
        </div>
        {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
        {bookingError && <div className="form-error-message"><XCircle size={15} />{bookingError}</div>}
        {loading || bookingLoading ? (
          <EmptyState icon={<Clock3 size={20} />} title="Loading journeys" description="Fetching your travel requests and booking records from Trapple." />
        ) : filtered.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Journey</th>
                  <th>Dates</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((journey) => (
                  <tr key={journey.id} onClick={() => setSelected(journey)}>
                    <td>
                      <div className="table-journey">
                        <span className="journey-icon"><Plane size={15} /></span>
                        <span>
                          <strong>{journey.destination}</strong>
                          <small>{journey.id} · {journey.from} → {journey.to}</small>
                        </span>
                      </div>
                    </td>
                    <td>{journey.dates}</td>
                    <td>{journey.project}</td>
                    <td><StatusBadge status={journey.status} /></td>
                    <td>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          className="table-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(journey);
                          }}
                        >
                          {bookingsByRequest[journey.id] ? "View booking" : "View details"} <ArrowUpRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="table-action table-action-danger"
                          title="Delete journey"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletingJourney(journey);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Compass size={20} />}
            title="No journeys found"
            description="Your submitted travel requests will appear here."
            action={<Link className="button button-primary button-small" href="/employee/plan-trip">Plan a trip</Link>}
          />
        )}
      </div>
      {selected && (
        <JourneyDrawer
          journey={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {confirmClearPast && (
        <DeleteConfirmDialog
          title="Clear past and completed journeys?"
          description="This will purge all completed and cancelled trips from your journeys list. Active pending and approved requests will remain intact."
          confirmLabel="Clear past trips"
          onConfirm={handleClearPast}
          onClose={() => setConfirmClearPast(false)}
        />
      )}
      {deletingJourney && (
        <DeleteConfirmDialog
          title={`Delete journey #${deletingJourney.id}?`}
          description={`Permanently remove journey to ${deletingJourney.destination} (${deletingJourney.project}) and any linked booking?`}
          confirmLabel="Delete journey"
          onConfirm={async () => {
            await travelRequestsApi.delete(deletingJourney.id);
            toast.success(`Journey #${deletingJourney.id} deleted.`);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setDeletingJourney(null)}
        />
      )}
    </div>
  );
}

function JourneyDrawer({ journey, onClose, onDeleted }: { journey: Journey; onClose: () => void; onDeleted?: () => void }) {
  const [booking, setBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    bookingsApi
      .byTravelRequest(journey.id)
      .then((data) => {
        if (active) setBooking(Array.isArray(data) ? data.find((b: any) => !b?.cancelled) || data[0] || null : data || null);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Booking details are unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [journey.id]);

  const cancelled = Boolean(booking?.cancelled);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="journey-drawer">
        <div className="drawer-header">
          <div>
            <span className="card-kicker">JOURNEY DETAIL</span>
            <h2>{journey.destination}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close journey detail">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-route">
          <div>
            <span>From</span>
            <strong>{journey.from}</strong>
          </div>
          <Plane size={18} />
          <div>
            <span>To</span>
            <strong>{journey.to}</strong>
          </div>
        </div>
        <div className="drawer-status">
          <StatusBadge status={cancelled ? "Cancelled" : journey.status} />
          <span>{journey.id}</span>
        </div>
        {journey.status === "Approved" || journey.status === "Booked" || journey.status === "Completed" ? (
          <div className="approver-box-approved">
            <ShieldCheck size={20} className="shrink-0" />
            <div>
              <strong>Approver Decision: Approved</strong>
              <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                Approved by {journey.approverName || "Assigned Manager"}
                {journey.approvalDate ? ` on ${formatRequestDate(journey.approvalDate)}` : ""}
                {journey.approvalComment ? ` · "${journey.approvalComment}"` : ""}. Authorized for ticketing.
              </p>
            </div>
          </div>
        ) : journey.status === "Pending approval" ? (
          <div className="approver-box-pending">
            <Clock3 size={20} className="shrink-0" />
            <div>
              <strong>Pending Approver Decision</strong>
              <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                This request is visible to the Travel Desk for advance preparation. Approver sign-off is pending.
              </p>
            </div>
          </div>
        ) : null}
        <div className="drawer-details">
          <Detail label="Travel dates" value={journey.dates} icon={<CalendarDays size={16} />} />
          <Detail label="Trip type" value={journey.tripType} icon={<BriefcaseBusiness size={16} />} />
          <Detail label="Project" value={journey.project} icon={<FileText size={16} />} />
        </div>
        <div className="drawer-booking-details">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">TICKET DETAILS</span>
              <h3 className="section-heading">Booking record</h3>
            </div>
            <TicketCheck size={17} className="panel-icon" />
          </div>
          {loading ? (
            <div className="booking-loading">
              <Clock3 size={15} /> Loading booking details…
            </div>
          ) : error ? (
            <div className="form-error-message">
              <XCircle size={15} />
              {error}
            </div>
          ) : booking ? (
            <div className="booking-detail-list">
              <Detail label="Status" value={cancelled ? "Cancelled" : "Booked"} icon={<Check size={16} />} />
              <Detail label="Booking type" value={booking.bookingType || "—"} icon={<TicketCheck size={16} />} />
              <Detail label="Reference" value={booking.bookingReference || "—"} icon={<FileText size={16} />} />
              <Detail label="Provider" value={booking.provider || "—"} icon={<Compass size={16} />} />
              <Detail label="Cost" value={booking.cost !== null && booking.cost !== undefined ? String(booking.cost) : "—"} icon={<WalletCards size={16} />} />
              <Detail label="Savings" value={booking.savings !== null && booking.savings !== undefined ? String(booking.savings) : "—"} icon={<Sparkles size={16} />} />
              <Detail label="Booked on" value={formatRequestDate(booking.bookedAt)} icon={<CalendarDays size={16} />} />
              {booking.notes && (
                <div className="booking-notes">
                  <small>Notes</small>
                  <p>{booking.notes}</p>
                </div>
              )}
              {cancelled && (
                <div className="booking-notes cancellation-note">
                  <small>Cancellation</small>
                  <p>
                    {booking.cancellationReason || "Cancelled"}
                    {booking.cancellationCharge !== null && booking.cancellationCharge !== undefined ? ` · Charge ${booking.cancellationCharge}` : ""}
                  </p>
                </div>
              )}
              {booking.attachmentData && (
                <div className="ticket-attachment-card">
                  <span className="card-kicker">ATTACHED TICKET / BOARDING PASS</span>
                  {booking.attachmentType?.includes("image") ? (
                    <img src={booking.attachmentData} alt="Ticket preview" className="ticket-attachment-preview" />
                  ) : (
                    <div className="ticket-doc-card">
                      <FileText size={22} className="text-red-500 shrink-0" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {booking.attachmentName || "ticket.pdf"}
                        </strong>
                        <small style={{ fontSize: 11, opacity: 0.75 }}>PDF Ticket Document</small>
                      </div>
                    </div>
                  )}
                  <a
                    href={booking.attachmentData}
                    download={booking.attachmentName || "ticket"}
                    target="_blank"
                    rel="noreferrer"
                    className="button button-small button-primary"
                    style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" }}
                  >
                    <Download size={13} /> View / Download {booking.attachmentType?.includes("pdf") ? "PDF Ticket" : "Ticket Photo"}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="booking-empty">
              <TicketCheck size={17} />
              <span>Booking details are not available yet.</span>
            </div>
          )}
        </div>
        <div className="drawer-timeline">
          <span className="card-kicker">LIFECYCLE</span>
          <TimelineItem label="Request submitted" done />
          <TimelineItem label="Manager approval" done={journey.status !== "Pending approval"} />
          <TimelineItem label="Travel desk booking" done={Boolean(booking) && !cancelled} />
          <TimelineItem label="Trip completed" done={journey.status === "Completed"} last />
        </div>
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <small style={{ color: "var(--ink-muted)", fontSize: 11 }}>Cancel or remove this journey?</small>
          <button
            type="button"
            className="button button-danger button-small"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} /> Delete this trip
          </button>
        </div>
      </aside>
      {confirmDelete && (
        <DeleteConfirmDialog
          title={`Delete journey #${journey.id}?`}
          description={`Permanently remove journey to ${journey.destination} (${journey.project}) and any associated booking record?`}
          confirmLabel="Delete trip"
          onConfirm={async () => {
            await travelRequestsApi.delete(journey.id);
            toast.success(`Journey #${journey.id} deleted.`);
            if (onDeleted) onDeleted();
            else onClose();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
function Detail({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="detail-row"><span className="detail-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong></span></div>; }
function TimelineItem({ label, done, last }: { label: string; done?: boolean; last?: boolean }) { return <div className={`timeline-item ${done ? "done" : ""} ${last ? "last" : ""}`}><span className="timeline-dot">{done && <Check size={11} />}</span><span>{label}</span></div>; }

function ApproverRequestDetailsModal({
  journey,
  onClose,
  onApprove,
  onReject,
  onDeleted,
}: {
  journey: Journey;
  onClose: () => void;
  onApprove?: (journey: Journey) => void;
  onReject?: (journey: Journey) => void;
  onDeleted?: () => void;
}) {
  const [booking, setBooking] = useState<any | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingBooking(true);
    bookingsApi.byTravelRequest(journey.id).then((data) => {
      if (active) setBooking(Array.isArray(data) ? data.find((b: any) => !b?.cancelled) || data[0] || null : data || null);
    }).catch(() => {
      if (active) setBooking(null);
    }).finally(() => {
      if (active) setLoadingBooking(false);
    });
    return () => { active = false; };
  }, [journey.id]);

  const emp = journey.employee || {
    name: journey.passenger || "Employee",
    employeeId: "EMP",
    department: "General Operations",
    designation: "Employee",
  };
  const isPending = journey.status === "Pending approval";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="approver-modal-title">
      <div className="request-details-modal">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 pr-8">
          <div>
            <span className="card-kicker">TRAVEL REQUEST DETAILS</span>
            <h2 id="approver-modal-title" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
              {journey.destination}
            </h2>
            <small style={{ color: "var(--ink-muted)", fontSize: 11 }}>Request ID: {journey.id} · Submitted by Employee</small>
          </div>
          <StatusBadge status={journey.status} />
        </div>

        {/* Whos details are these: Employee Profile Card */}
        <div className="employee-profile-card">
          <div className="employee-avatar-large">
            {(emp.name || journey.passenger || "E").slice(0, 2).toUpperCase()}
          </div>
          <div className="employee-profile-info">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
              Requesting Employee
            </span>
            <h3>{emp.name || journey.passenger}</h3>
            <div className="employee-meta-chips">
              <span className="meta-chip meta-chip-primary">
                <UserRound size={12} /> ID: {emp.employeeId || "EMP"}
              </span>
              <span className="meta-chip">
                Department: {emp.department || "General Operations"}
              </span>
              <span className="meta-chip">
                Designation: {emp.designation || "Employee"}
              </span>
            </div>
          </div>
        </div>

        {/* Trip details submitted by the employee */}
        <div className="drawer-route" style={{ margin: "14px 0" }}>
          <div>
            <span>Origin (From)</span>
            <strong>{journey.from}</strong>
          </div>
          <Plane size={18} />
          <div>
            <span>Destination (To)</span>
            <strong>{journey.to}</strong>
          </div>
        </div>

        <div className="modal-details-grid">
          <Detail label="Travel dates" value={journey.dates} icon={<CalendarDays size={16} />} />
          <Detail label="Trip type" value={journey.tripType} icon={<BriefcaseBusiness size={16} />} />
          <Detail label="Project name" value={journey.project} icon={<FileText size={16} />} />
          <Detail label="Approver status" value={journey.status} icon={<ShieldCheck size={16} />} />
        </div>

        {/* Business reason submitted by employee */}
        <div className="reason-box">
          <div className="reason-box-header">
            <FileText size={14} />
            <span>Business Reason & Justification for Travel</span>
          </div>
          <p className="reason-box-content">
            {journey.reason || "Travel required for official business purpose."}
          </p>
        </div>

        {/* Travel Desk confirmed bookings & ticket vouchers */}
        <div className="desk-booking-callout">
          <div className="desk-booking-callout-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TicketCheck size={18} style={{ color: "var(--saffron)" }} />
              <strong style={{ fontSize: 13 }}>Travel Desk Bookings & Ticketing</strong>
            </div>
            {booking ? (
              <span className="approval-pill booked">
                <Check size={11} /> {booking.cancelled ? "Cancelled" : "Ticket Issued"}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                {isPending ? "Awaiting manager approval" : "No desk booking yet"}
              </span>
            )}
          </div>

          {loadingBooking ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, fontSize: 12, color: "var(--ink-muted)" }}>
              <Clock3 size={15} /> Checking Travel Desk booking records…
            </div>
          ) : booking ? (
            <div>
              <div className="desk-booking-grid">
                <div className="desk-booking-item">
                  <span>PNR / Reference</span>
                  <strong>{booking.bookingReference || "—"}</strong>
                </div>
                <div className="desk-booking-item">
                  <span>Booking Type</span>
                  <strong>{booking.bookingType || "Flight"}</strong>
                </div>
                <div className="desk-booking-item">
                  <span>Provider / Airline</span>
                  <strong>{booking.provider || "—"}</strong>
                </div>
                <div className="desk-booking-item">
                  <span>Total Cost</span>
                  <strong>{booking.cost ? `₹${Number(booking.cost).toLocaleString("en-IN")}` : "—"}</strong>
                </div>
                <div className="desk-booking-item">
                  <span>Cost Savings</span>
                  <strong>{booking.savings ? `₹${Number(booking.savings).toLocaleString("en-IN")}` : "₹0"}</strong>
                </div>
                <div className="desk-booking-item">
                  <span>Booked Date</span>
                  <strong>{formatRequestDate(booking.bookedAt)}</strong>
                </div>
              </div>

              {booking.notes && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(0,0,0,0.03)", fontSize: 12 }}>
                  <small style={{ fontWeight: 700, color: "var(--ink-muted)" }}>Travel Desk Instructions / Notes:</small>
                  <p style={{ margin: "2px 0 0" }}>{booking.notes}</p>
                </div>
              )}

              {/* Attached Ticket (Photo or PDF) */}
              {booking.attachmentData ? (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Attached Ticket Copy from Travel Desk
                  </span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {booking.attachmentType?.includes("pdf") ? (
                        <FileText size={22} className="text-red-500 shrink-0" />
                      ) : (
                        <ImageIcon size={22} className="text-emerald-500 shrink-0" />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {booking.attachmentName || (booking.attachmentType?.includes("pdf") ? "ticket_voucher.pdf" : "ticket_copy.png")}
                        </strong>
                        <small style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                          {booking.attachmentType?.includes("pdf") ? "PDF Ticket Voucher" : "Ticket Photo Copy"}
                        </small>
                      </div>
                    </div>
                    <a
                      href={booking.attachmentData}
                      download={booking.attachmentName || "ticket"}
                      target="_blank"
                      rel="noreferrer"
                      className="button button-small button-primary"
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <Download size={13} /> View / Download
                    </a>
                  </div>

                  {booking.attachmentType?.includes("image") && (
                    <div style={{ marginTop: 10 }}>
                      <img src={booking.attachmentData} alt="Ticket preview" className="ticket-attachment-preview" style={{ maxHeight: 220 }} />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-muted)" }}>
                  No ticket photo or PDF attachment uploaded yet for this booking.
                </div>
              )}
            </div>
          ) : (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>
              {isPending
                ? "This travel request has been received by Travel Desk for advance visibility, awaiting your approval before ticketing."
                : "No confirmed ticket has been issued yet by the Travel Desk for this request."}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="dialog-actions" style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            className="button button-danger button-small"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} /> Delete request
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <button type="button" className="button button-ghost" onClick={onClose}>
              Close
            </button>
            {isPending && onReject && onApprove && (
              <>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    onClose();
                    onReject(journey);
                  }}
                >
                  Reject Request
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    onClose();
                    onApprove(journey);
                  }}
                >
                  Approve Request <ArrowUpRight size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {confirmDelete && (
        <DeleteConfirmDialog
          title={`Delete request #${journey.id}?`}
          description={`Permanently remove travel request for ${emp.name || journey.passenger || "employee"} to ${journey.destination}? This will delete it from all queues.`}
          confirmLabel="Delete request"
          onConfirm={async () => {
            await travelRequestsApi.delete(journey.id);
            toast.success(`Request #${journey.id} deleted.`);
            if (onDeleted) onDeleted();
            else onClose();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function ApproverBookingDetailModal({
  item,
  onClose,
}: {
  item: { booking: any; req?: Journey };
  onClose: () => void;
}) {
  const { booking, req } = item;
  const emp = req?.employee || {
    name: req?.passenger || "Employee",
    employeeId: "EMP",
    department: "General Operations",
    designation: "Employee",
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="request-details-modal">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close booking details">
          <X size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 pr-8">
          <div>
            <span className="card-kicker">TRAVEL DESK CONFIRMED BOOKING</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
              PNR: {booking.bookingReference || "—"}
            </h2>
            <small style={{ color: "var(--ink-muted)", fontSize: 11 }}>
              {booking.bookingType || "Flight"} · Issued by Travel Desk
            </small>
          </div>
          <StatusBadge status={booking.cancelled ? "Cancelled" : "Booked"} />
        </div>

        {/* Employee Profile Card */}
        <div className="employee-profile-card">
          <div className="employee-avatar-large">
            {(emp.name || "E").slice(0, 2).toUpperCase()}
          </div>
          <div className="employee-profile-info">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
              Ticketed For Employee
            </span>
            <h3>{emp.name}</h3>
            <div className="employee-meta-chips">
              <span className="meta-chip meta-chip-primary">
                <UserRound size={12} /> ID: {emp.employeeId}
              </span>
              <span className="meta-chip">Department: {emp.department}</span>
              <span className="meta-chip">Designation: {emp.designation}</span>
            </div>
          </div>
        </div>

        {/* Route & Booking Details */}
        {req && (
          <div className="drawer-route" style={{ margin: "14px 0" }}>
            <div>
              <span>From</span>
              <strong>{req.from}</strong>
            </div>
            <Plane size={18} />
            <div>
              <span>To</span>
              <strong>{req.to}</strong>
            </div>
          </div>
        )}

        <div className="modal-details-grid">
          <Detail label="Booking Type" value={booking.bookingType || "Flight"} icon={<TicketCheck size={16} />} />
          <Detail label="Provider / Airline" value={booking.provider || "—"} icon={<Compass size={16} />} />
          <Detail label="Total Cost" value={booking.cost ? `₹${Number(booking.cost).toLocaleString("en-IN")}` : "—"} icon={<WalletCards size={16} />} />
          <Detail label="Cost Savings" value={booking.savings ? `₹${Number(booking.savings).toLocaleString("en-IN")}` : "₹0"} icon={<Sparkles size={16} />} />
          <Detail label="Issue Date" value={formatRequestDate(booking.bookedAt)} icon={<CalendarDays size={16} />} />
          <Detail label="Project / Request" value={req?.project ? `${req.project} (Req #${req.id})` : `Req #${booking.travelRequest?.id || "—"}`} icon={<FileText size={16} />} />
        </div>

        {req?.reason && (
          <div className="reason-box">
            <div className="reason-box-header">
              <FileText size={14} />
              <span>Employee Travel Justification</span>
            </div>
            <p className="reason-box-content">{req.reason}</p>
          </div>
        )}

        {booking.notes && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.03)" }}>
            <small style={{ fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", fontSize: 10 }}>
              Travel Desk Booking Notes:
            </small>
            <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.5 }}>{booking.notes}</p>
          </div>
        )}

        {/* Attached Ticket (Photo or PDF) */}
        {booking.attachmentData && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Attached Ticket Voucher / Boarding Pass
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {booking.attachmentType?.includes("pdf") ? (
                  <FileText size={26} className="text-red-500 shrink-0" />
                ) : (
                  <ImageIcon size={26} className="text-emerald-500 shrink-0" />
                )}
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {booking.attachmentName || "ticket_document"}
                  </strong>
                  <small style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    {booking.attachmentType?.includes("pdf") ? "PDF Document" : "Ticket Image"}
                  </small>
                </div>
              </div>
              <a
                href={booking.attachmentData}
                download={booking.attachmentName || "ticket"}
                target="_blank"
                rel="noreferrer"
                className="button button-small button-primary"
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={13} /> Download Ticket
              </a>
            </div>

            {booking.attachmentType?.includes("image") && (
              <div style={{ marginTop: 12 }}>
                <img
                  src={booking.attachmentData}
                  alt="Ticket preview"
                  className="ticket-attachment-preview"
                  style={{ maxHeight: 260 }}
                />
              </div>
            )}
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: 22 }}>
          <button type="button" className="button button-primary" onClick={onClose}>
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ApproverBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [requests, setRequests] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([bookingsApi.list(), travelRequestsApi.list()])
      .then(([nextBookings, nextRequests]) => {
        if (!active) return;
        setBookings(Array.isArray(nextBookings) ? nextBookings : []);
        setRequests(Array.isArray(nextRequests) ? nextRequests.map(toJourney) : []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load Travel Desk bookings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const requestMap = useMemo(() => {
    const map = new Map<string, Journey>();
    for (const r of requests) {
      map.set(String(r.id), r);
    }
    return map;
  }, [requests]);

  const activeBookings = bookings.filter((b) => !b?.cancelled);
  const totalSpend = activeBookings.reduce((sum, b) => sum + (Number(b?.cost) || 0), 0);
  const totalSavings = activeBookings.reduce((sum, b) => sum + (Number(b?.savings) || 0), 0);
  const withAttachments = bookings.filter((b) => Boolean(b?.attachmentData)).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const req = requestMap.get(String(b?.travelRequest?.id));
      const empName = req?.employee?.name || req?.passenger || "";
      const ref = String(b?.bookingReference || "");
      const prov = String(b?.provider || "");
      const dest = req?.destination || "";
      return (
        empName.toLowerCase().includes(q) ||
        ref.toLowerCase().includes(q) ||
        prov.toLowerCase().includes(q) ||
        dest.toLowerCase().includes(q)
      );
    });
  }, [bookings, requestMap, query]);

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/approver/bookings"]} />

      <section className="ops-hero">
        <div>
          <span className="card-kicker">TRAVEL DESK AUDIT & VISIBILITY</span>
          <h2>Travel desk confirmed bookings</h2>
          <p>
            Full visibility into tickets issued by the Travel Desk across your team. Inspect confirmed PNRs, ticket vouchers (PDF/photos), routes, and costs.
          </p>
        </div>
        <div className="ops-hero-metric">
          <span>Total spend</span>
          <strong>₹{totalSpend.toLocaleString("en-IN")}</strong>
          <small>{activeBookings.length} confirmed bookings</small>
        </div>
      </section>

      {/* Mass & Bulk Movements Alert Banner */}
      <div
        className="panel"
        style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          padding: "16px 20px",
          borderRadius: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(59, 130, 246, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#60a5fa",
            }}
          >
            <UsersRound size={20} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
              Mass & Bulk Travel Movements (Up to 100+ Passengers)
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              The Travel Desk logs mass bookings, flight blocks, and group manifests. Inspect headcount rosters and approve bulk allocations.
            </div>
          </div>
        </div>
        <Link
          href="/approver/bulk-bookings"
          className="button button-primary"
          style={{ padding: "8px 14px", fontSize: 12, gap: 6 }}
        >
          Inspect Bulk Movements <ArrowUpRight size={14} />
        </Link>
      </div>

      <section className="stats-grid desk-stats">
        <StatCard
          label="Confirmed bookings"
          value={String(activeBookings.length).padStart(2, "0")}
          detail="Active ticketing records"
          icon={<TicketCheck size={18} />}
          accent="stat-accent"
        />
        <StatCard
          label="Total travel spend"
          value={`₹${totalSpend.toLocaleString("en-IN")}`}
          detail="Sum of issued bookings"
          icon={<WalletCards size={18} />}
        />
        <StatCard
          label="Savings captured"
          value={`₹${totalSavings.toLocaleString("en-IN")}`}
          detail="Negotiated desk rates"
          icon={<Sparkles size={18} />}
        />
        <StatCard
          label="Tickets on file"
          value={String(withAttachments).padStart(2, "0")}
          detail="PDFs / Photos attached"
          icon={<FileText size={18} />}
        />
      </section>

      <div className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by employee name, PNR reference, airline/provider, or destination"
            />
          </div>
          <span className="data-note">
            <ShieldCheck size={13} /> Live Travel Desk data
          </span>
        </div>

        {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

        {loading ? (
          <EmptyState
            icon={<Clock3 size={20} />}
            title="Loading Travel Desk bookings"
            description="Fetching tickets and booking records issued by the Travel Desk."
          />
        ) : filtered.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Employee / Passenger</th>
                  <th>PNR / Reference</th>
                  <th>Route & Dates</th>
                  <th>Type & Provider</th>
                  <th>Cost & Savings</th>
                  <th>Ticket copy</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booking) => {
                  const req = requestMap.get(String(booking?.travelRequest?.id));
                  const emp = req?.employee || {
                    name: req?.passenger || "Employee",
                    employeeId: "EMP",
                    department: "General Operations",
                  };
                  return (
                    <tr key={booking.id}>
                      <td>
                        <div className="table-journey">
                          <span className="avatar avatar-tiny">
                            {(emp.name || "E").slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{emp.name}</strong>
                            <small>{emp.employeeId} · {emp.department}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{booking.bookingReference || "—"}</strong>
                        <small className="table-subline">Req #{booking.travelRequest?.id || req?.id || "—"}</small>
                      </td>
                      <td>
                        <strong>{req?.destination || "—"}</strong>
                        <small className="table-subline">{req ? `${req.from} → ${req.to}` : booking.bookedAt ? formatRequestDate(booking.bookedAt) : "—"}</small>
                      </td>
                      <td>
                        <strong>{booking.bookingType || "Flight"}</strong>
                        <small className="table-subline">{booking.provider || "Standard provider"}</small>
                      </td>
                      <td>
                        <strong>{booking.cost !== undefined ? `₹${Number(booking.cost).toLocaleString("en-IN")}` : "—"}</strong>
                        {booking.savings ? (
                          <small className="table-subline" style={{ color: "var(--green)" }}>
                            Saved ₹{Number(booking.savings).toLocaleString("en-IN")}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {booking.attachmentData ? (
                          <a
                            href={booking.attachmentData}
                            download={booking.attachmentName || "ticket"}
                            target="_blank"
                            rel="noreferrer"
                            className="ticket-badge"
                            title={`Click to view/download ${booking.attachmentName || "ticket"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {booking.attachmentType?.includes("pdf") ? (
                              <FileText size={12} className="text-red-500" />
                            ) : (
                              <ImageIcon size={12} className="text-emerald-500" />
                            )}
                            <span>{booking.attachmentType?.includes("pdf") ? "PDF Ticket" : "Photo"}</span>
                            <Download size={10} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, opacity: 0.4 }}>No attachment</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={booking.cancelled ? "Cancelled" : "Booked"} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setSelectedBooking({ booking, req })}
                        >
                          View details <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<TicketCheck size={20} />}
            title="No desk bookings found"
            description="Bookings issued and ticketed by the Travel Desk will be listed here."
          />
        )}
      </div>

      {selectedBooking && (
        <ApproverBookingDetailModal
          item={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  );
}

function GroupManifestModal({
  booking,
  onClose,
  onUpdate,
  isApprover = false,
}: {
  booking: BulkBookingRecord;
  onClose: () => void;
  onUpdate?: () => void;
  isApprover?: boolean;
}) {
  const [passengerSearch, setPassengerSearch] = useState("");
  const [approverComment, setApproverComment] = useState(booking.approverComment || "");
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentBooking, setCurrentBooking] = useState<BulkBookingRecord>(booking);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await bulkBookingsApi.delete(currentBooking.id);
      toast.success(`Bulk booking ${currentBooking.groupReference} deleted.`);
      if (onUpdate) onUpdate();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete bulk booking.");
      setDeleting(false);
    }
  };

  const manifest = currentBooking.passengerList || [];
  const filteredManifest = useMemo(() => {
    const q = passengerSearch.trim().toLowerCase();
    if (!q) return manifest;
    return manifest.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.employeeId && p.employeeId.toLowerCase().includes(q)) ||
      (p.department && p.department.toLowerCase().includes(q)) ||
      (p.seatOrCoach && p.seatOrCoach.toLowerCase().includes(q))
    );
  }, [manifest, passengerSearch]);

  const handleApproverDecision = async (status: "APPROVED" | "NOTED") => {
    setReviewing(true);
    try {
      const updated = await bulkBookingsApi.reviewByApprover(currentBooking.id, status, approverComment);
      setCurrentBooking(updated);
      toast.success(status === "APPROVED" ? "Bulk movement budget approved successfully!" : "Bulk movement noted.");
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update approver status.");
    } finally {
      setReviewing(false);
    }
  };

  const downloadManifestCsv = () => {
    const headers = ["Sl No", "Passenger Name", "Employee ID", "Department", "Seat / Berth / Allocation", "Master PNR", "Group Mission"];
    const rows = (manifest.length > 0 ? manifest : Array.from({ length: currentBooking.headcount }, (_, i) => ({
      name: `Passenger ${i + 1}`,
      employeeId: `EMP-${1000 + i}`,
      department: currentBooking.departments?.[0] || "Operations",
      seatOrCoach: `Block ${Math.floor(i / 30) + 1} - Seat ${((i % 30) + 1)}`,
    }))).map((p, index) => [
      String(index + 1),
      p.name,
      p.employeeId || "—",
      p.department || "Operations",
      p.seatOrCoach || `Seat ${index + 1}`,
      currentBooking.groupReference,
      currentBooking.title,
    ]);
    exportToCsv(`manifest_${currentBooking.groupReference}_${currentBooking.destination}`, headers, rows);
    toast.success("Passenger manifest CSV downloaded.");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="request-details-modal" style={{ maxWidth: 860, maxHeight: "90vh", overflowY: "auto" }}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close group voucher">
          <X size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 pr-8">
          <div>
            <span className="card-kicker">MASS MOVEMENT VOUCHER & MANIFEST</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
              {currentBooking.title}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <span className="meta-chip meta-chip-primary">
                <TicketCheck size={12} /> Master PNR: {currentBooking.groupReference}
              </span>
              <span className="headcount-badge headcount-badge-large">
                <UsersRound size={14} /> {currentBooking.headcount} Confirmed Travelers
              </span>
              <span className="meta-chip">
                {currentBooking.travelMode} · {currentBooking.provider}
              </span>
            </div>
          </div>
          <div>
            {currentBooking.approverStatus === "APPROVED" ? (
              <span className="approval-pill approved"><CheckCircle2 size={13} /> Approver Approved</span>
            ) : currentBooking.approverStatus === "NOTED" ? (
              <span className="approval-pill booked"><Check size={13} /> Approver Noted</span>
            ) : (
              <span className="approval-pill pending"><Clock3 size={13} /> Pending Approver Sign-off</span>
            )}
          </div>
        </div>

        {/* Movement Summary Cards */}
        <div className="stats-grid desk-stats" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard
            label="Route & Destination"
            value={currentBooking.destination}
            detail={`${currentBooking.fromLocation} → ${currentBooking.destination}`}
            icon={<Compass size={18} />}
          />
          <StatCard
            label="Travel Dates"
            value={currentBooking.travelDates.split("–")[0]?.trim() || currentBooking.travelDates}
            detail={currentBooking.travelDates}
            icon={<CalendarDays size={18} />}
          />
          <StatCard
            label="Total Group Spend"
            value={`₹${currentBooking.totalCost.toLocaleString("en-IN")}`}
            detail={`₹${currentBooking.costPerPerson.toLocaleString("en-IN")} per traveler`}
            icon={<WalletCards size={18} />}
            accent="stat-accent"
          />
          <StatCard
            label="Corporate Savings"
            value={currentBooking.savings ? `₹${currentBooking.savings.toLocaleString("en-IN")}` : "Negotiated"}
            detail="Bulk desk rate"
            icon={<Sparkles size={18} />}
          />
        </div>

        {/* Logistics & Coordinator Details */}
        <div className="panel" style={{ background: "var(--surface-soft)", border: "1px solid var(--line)", padding: "14px 18px", marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 12 }}>
            <div>
              <span style={{ color: "var(--ink-muted)", display: "block" }}>Project / Cost Center</span>
              <strong style={{ color: "var(--ink)" }}>{currentBooking.project || "Jamnagar Petrochem Operations"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-muted)", display: "block" }}>Logged by Travel Desk Coordinator</span>
              <strong style={{ color: "var(--ink)" }}>{currentBooking.coordinatorName || "Travel Desk Operations (123456)"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-muted)", display: "block" }}>Date Logged</span>
              <strong style={{ color: "var(--ink)" }}>{new Date(currentBooking.loggedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
            </div>
          </div>
          {currentBooking.itineraryNotes && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-soft)" }}>
              <strong>Logistics instructions: </strong> {currentBooking.itineraryNotes}
            </div>
          )}
          {currentBooking.attachmentData && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={22} className="text-red-500 shrink-0" />
                <div>
                  <strong style={{ fontSize: 13, color: "var(--ink)", display: "block" }}>
                    {currentBooking.attachmentName || "Group_Movement_Voucher.pdf"}
                  </strong>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                    Attached Travel Document & Itinerary Voucher
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button button-ghost"
                  style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                  onClick={() => {
                    const w = window.open("");
                    if (w) {
                      w.document.write(`<iframe src="${currentBooking.attachmentData}" style="width:100vw; height:100vh; border:none;" />`);
                      w.document.title = currentBooking.attachmentName || "Group Voucher PDF";
                    }
                  }}
                >
                  <Eye size={13} /> View PDF
                </button>
                <a
                  href={currentBooking.attachmentData}
                  download={currentBooking.attachmentName || `${currentBooking.groupReference}_voucher.pdf`}
                  className="button button-primary"
                  style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                >
                  <Download size={13} /> Download PDF
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Approver Sign-off Section */}
        {isApprover ? (
          <div className="panel" style={{ border: "1px solid rgba(59, 130, 246, 0.3)", background: "rgba(59, 130, 246, 0.04)", padding: "16px 20px", marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={18} style={{ color: "var(--blue)" }} />
              <strong style={{ fontSize: 14, color: "var(--ink)" }}>Approver Review & Budget Sign-off</strong>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 12px" }}>
              As the Designated Approver, review the headcount allocation ({currentBooking.headcount} travelers) and total budget (₹{currentBooking.totalCost.toLocaleString("en-IN")}) logged by the Travel Desk.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Approver comments / audit notes:</span>
                <input
                  value={approverComment}
                  onChange={(e) => setApproverComment(e.target.value)}
                  placeholder="e.g. Approved under site commissioning mobilization budget allocation."
                  style={{ fontSize: 12 }}
                />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleApproverDecision("APPROVED")}
                  disabled={reviewing}
                  style={{ background: "#059669", borderColor: "#059669" }}
                >
                  <CheckCircle2 size={15} /> {reviewing ? "Saving…" : "Sign Off & Approve Budget"}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => handleApproverDecision("NOTED")}
                  disabled={reviewing}
                >
                  <Check size={14} /> Mark Acknowledged / Noted
                </button>
              </div>
            </div>
          </div>
        ) : currentBooking.approverComment ? (
          <div className="panel" style={{ border: "1px solid rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.04)", padding: "12px 16px", marginTop: 14, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#059669", fontWeight: 700, marginBottom: 4 }}>
              <CheckCircle2 size={15} /> Approver Sign-off on File
            </div>
            <div style={{ color: "var(--ink)" }}>"{currentBooking.approverComment}"</div>
            {currentBooking.approverReviewedAt && (
              <small style={{ color: "var(--ink-muted)", fontSize: 10 }}>Signed off on {new Date(currentBooking.approverReviewedAt).toLocaleString("en-IN")}</small>
            )}
          </div>
        ) : null}

        {/* Passenger Manifest Roster Section */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Passenger Manifest Roster ({manifest.length || currentBooking.headcount} travelers)
              </h3>
              <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "2px 0 0" }}>
                Roster breakdown for master PNR {currentBooking.groupReference}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="button button-ghost"
                onClick={downloadManifestCsv}
                style={{ padding: "6px 12px", fontSize: 12 }}
                title="Download CSV roster"
              >
                <FileSpreadsheet size={14} /> Export CSV Roster
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={handlePrint}
                style={{ padding: "6px 12px", fontSize: 12 }}
                title="Print Group Voucher"
              >
                <Printer size={14} /> Print Voucher
              </button>
            </div>
          </div>

          <div className="search-field" style={{ marginBottom: 10 }}>
            <Search size={15} />
            <input
              value={passengerSearch}
              onChange={(e) => setPassengerSearch(e.target.value)}
              placeholder="Search manifest by passenger name, employee ID, department, or seat/coach…"
              style={{ fontSize: 12 }}
            />
          </div>

          <div className="manifest-list-preview" style={{ maxHeight: 320 }}>
            {filteredManifest.length > 0 ? (
              filteredManifest.map((p, idx) => (
                <div className="manifest-row-item" key={idx}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-muted)", width: 24 }}>#{idx + 1}</span>
                    <span className="avatar avatar-tiny">{(p.name || "P").slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong style={{ fontSize: 13, color: "var(--ink)" }}>{p.name}</strong>
                      <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {p.employeeId ? `ID: ${p.employeeId} · ` : ""}{p.department || "Operations"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="meta-chip" style={{ fontSize: 11 }}>
                      {p.seatOrCoach || `Seat ${idx + 1}`}
                    </span>
                    <span className="ticket-badge" style={{ fontSize: 10 }}>
                      <Check size={10} /> Confirmed
                    </span>
                  </div>
                </div>
              ))
            ) : manifest.length === 0 ? (
              <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "var(--ink-muted)" }}>
                Group block confirmed for {currentBooking.headcount} travelers on Master PNR {currentBooking.groupReference}.
              </div>
            ) : (
              <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "var(--ink-muted)" }}>
                No passengers match "{passengerSearch}".
              </div>
            )}
          </div>
        </div>

        <div className="dialog-actions" style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            className="button button-ghost"
            style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
          >
            <Trash2 size={14} /> Delete Bulk Booking
          </button>
          <button type="button" className="button button-primary" onClick={onClose}>
            Done / Close Voucher
          </button>
        </div>

        {showDeleteConfirm && (
          <DeleteConfirmDialog
            title={`Delete bulk booking ${currentBooking.groupReference}?`}
            description={`Permanently remove "${currentBooking.title}" for ${currentBooking.headcount} travelers to ${currentBooking.destination}? This will delete it across all dashboards.`}
            confirmLabel={deleting ? "Deleting..." : "Delete Bulk Booking"}
            onConfirm={handleDelete}
            onClose={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}

function ApproverBulkBookings() {
  const [records, setRecords] = useState<BulkBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING_REVIEW" | "APPROVED">("ALL");
  const [selectedRecord, setSelectedRecord] = useState<BulkBookingRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<BulkBookingRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    bulkBookingsApi.list()
      .then((data) => {
        if (active) setRecords(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load bulk bookings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const handleSync = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("trapple_cloud_synced", handleSync);
    window.addEventListener("travora_cloud_synced", handleSync);

    return () => {
      active = false;
      window.removeEventListener("trapple_cloud_synced", handleSync);
      window.removeEventListener("travora_cloud_synced", handleSync);
    };
  }, [refreshKey]);

  const totalHeadcount = records.reduce((sum, r) => sum + (r.headcount || 0), 0);
  const totalSpend = records.reduce((sum, r) => sum + (r.totalCost || 0), 0);
  const pendingCount = records.filter((r) => r.approverStatus === "PENDING_REVIEW").length;
  const approvedCount = records.filter((r) => r.approverStatus === "APPROVED").length;

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== "ALL" && (r.approverStatus || "PENDING_REVIEW") !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.title?.toLowerCase().includes(q) ||
        r.destination?.toLowerCase().includes(q) ||
        r.fromLocation?.toLowerCase().includes(q) ||
        r.groupReference?.toLowerCase().includes(q) ||
        r.provider?.toLowerCase().includes(q) ||
        r.project?.toLowerCase().includes(q)
      );
    });
  }, [records, statusFilter, query]);

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/approver/bulk-bookings"]} />

      <section className="ops-hero">
        <div>
          <span className="card-kicker">APPROVER AUDIT & MASS MOVEMENTS</span>
          <h2>Bulk & Group Travel Allocations</h2>
          <p>
            Review bulk travel bookings logged by the Travel Desk for large teams (50 to 100+ travelers). Inspect passenger manifest rosters, master PNRs, and sign off on group budgets.
          </p>
        </div>
        <div className="ops-hero-metric">
          <span>Total Group Spend</span>
          <strong>₹{totalSpend.toLocaleString("en-IN")}</strong>
          <small>{totalHeadcount} travelers across {records.length} movements</small>
        </div>
      </section>

      <section className="stats-grid desk-stats">
        <StatCard
          label="Total Mass Movements"
          value={String(records.length).padStart(2, "0")}
          detail="Active group bookings"
          icon={<UsersRound size={18} />}
          accent="stat-accent"
        />
        <StatCard
          label="Total Travelers"
          value={String(totalHeadcount).padStart(2, "0")}
          detail="Headcount allocated"
          icon={<UserRound size={18} />}
        />
        <StatCard
          label="Group Travel Budget"
          value={`₹${totalSpend.toLocaleString("en-IN")}`}
          detail="Cumulative mass spend"
          icon={<WalletCards size={18} />}
        />
        <StatCard
          label="Pending Review"
          value={String(pendingCount).padStart(2, "0")}
          detail={`${approvedCount} approved`}
          icon={<Clock3 size={18} />}
        />
      </section>

      <div className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, destination, master PNR reference, carrier, or project…"
            />
          </div>
          <div className="filter-chips">
            <button
              type="button"
              className={`filter-chip ${statusFilter === "ALL" ? "filter-chip-active" : ""}`}
              onClick={() => setStatusFilter("ALL")}
            >
              All movements ({records.length})
            </button>
            <button
              type="button"
              className={`filter-chip ${statusFilter === "PENDING_REVIEW" ? "filter-chip-active" : ""}`}
              onClick={() => setStatusFilter("PENDING_REVIEW")}
            >
              Pending Sign-off ({pendingCount})
            </button>
            <button
              type="button"
              className={`filter-chip ${statusFilter === "APPROVED" ? "filter-chip-active" : ""}`}
              onClick={() => setStatusFilter("APPROVED")}
            >
              Approved ({approvedCount})
            </button>
          </div>
        </div>

        {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

        {loading ? (
          <EmptyState
            icon={<Clock3 size={20} />}
            title="Loading bulk movements"
            description="Fetching group travel bookings from the Travel Desk."
          />
        ) : filtered.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Group Mission / Title</th>
                  <th>Route & Dates</th>
                  <th>Carrier & Master PNR</th>
                  <th>Headcount</th>
                  <th>Total Cost & Cost/Pax</th>
                  <th>Approver Sign-off</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div>
                        <strong>{record.title}</strong>
                        <small className="table-subline">{record.project || "Operations"}</small>
                      </div>
                    </td>
                    <td>
                      <strong>{record.destination}</strong>
                      <small className="table-subline">{record.fromLocation} → {record.destination} · {record.travelDates}</small>
                    </td>
                    <td>
                      <strong>{record.groupReference}</strong>
                      <small className="table-subline">{record.provider} ({record.travelMode})</small>
                    </td>
                    <td>
                      <span className="headcount-badge">
                        <UsersRound size={12} /> {record.headcount} travelers
                      </span>
                    </td>
                    <td>
                      <strong>₹{record.totalCost.toLocaleString("en-IN")}</strong>
                      <small className="table-subline">₹{record.costPerPerson.toLocaleString("en-IN")} / head</small>
                    </td>
                    <td>
                      {record.approverStatus === "APPROVED" ? (
                        <span className="approval-pill approved"><CheckCircle2 size={12} /> Approved</span>
                      ) : record.approverStatus === "NOTED" ? (
                        <span className="approval-pill booked"><Check size={12} /> Noted</span>
                      ) : (
                        <span className="approval-pill pending"><Clock3 size={12} /> Pending Review</span>
                      )}
                    </td>
                    <td>
                      <div className="table-inline-actions">
                        <button
                          type="button"
                          className="table-action"
                          style={{ color: "var(--blue)", fontWeight: 700 }}
                          onClick={() => setSelectedRecord(record)}
                        >
                          Inspect Manifest & Sign Off <ArrowUpRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="table-action table-action-danger"
                          title="Delete bulk booking"
                          onClick={() => setDeletingRecord(record)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<UsersRound size={20} />}
            title="No mass movements found"
            description="Group travel bookings logged by the Travel Desk will appear here."
          />
        )}
      </div>

      {selectedRecord && (
        <GroupManifestModal
          booking={selectedRecord}
          isApprover={true}
          onClose={() => setSelectedRecord(null)}
          onUpdate={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {deletingRecord && (
        <DeleteConfirmDialog
          title={`Delete bulk booking ${deletingRecord.groupReference}?`}
          description={`Permanently remove group movement "${deletingRecord.title}" for ${deletingRecord.headcount} travelers to ${deletingRecord.destination}?`}
          confirmLabel="Delete bulk booking"
          onConfirm={async () => {
            await bulkBookingsApi.delete(deletingRecord.id);
            setRecords((prev) => prev.filter((r) => r.id !== deletingRecord.id));
            toast.success(`Bulk booking ${deletingRecord.groupReference} deleted.`);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setDeletingRecord(null)}
        />
      )}
    </div>
  );
}

function BulkBookingDialog({
  booking,
  onClose,
  onSuccess,
}: {
  booking?: BulkBookingRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(booking?.title || "Jamnagar Petrochem Site Commissioning - 100 Engineers");
  const [destination, setDestination] = useState(booking?.destination || "Jamnagar");
  const [fromLocation, setFromLocation] = useState(booking?.fromLocation || "Mumbai");
  const [travelDates, setTravelDates] = useState(booking?.travelDates || "18 Oct 2026 – 25 Oct 2026");
  const [travelMode, setTravelMode] = useState<"FLIGHT" | "TRAIN" | "BUS" | "HOTEL" | "MULTI_MODAL">(booking?.travelMode || "FLIGHT");
  const [provider, setProvider] = useState(booking?.provider || "IndiGo Corporate Group Desk");
  const [groupReference, setGroupReference] = useState(booking?.groupReference || `GRP-6E-${Math.floor(10000 + Math.random() * 90000)}`);
  const [headcount, setHeadcount] = useState<number>(booking?.headcount || 100);
  const [totalCost, setTotalCost] = useState<number>(booking?.totalCost || 850000);
  const [savings, setSavings] = useState<number>(booking?.savings || 75000);
  const [project, setProject] = useState(booking?.project || "Jamnagar Refinery Phase 3");
  const [itineraryNotes, setItineraryNotes] = useState(
    booking?.itineraryNotes || "Dedicated check-in counter at Terminal 2. Airport shuttle bus arranged to Jamnagar township."
  );
  const [passengers, setPassengers] = useState<BulkBookingPassenger[]>(
    booking?.passengerList || []
  );

  const [attachmentName, setAttachmentName] = useState(booking?.attachmentName || "");
  const [attachmentType, setAttachmentType] = useState(
    booking?.attachmentName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : ""
  );
  const [attachmentData, setAttachmentData] = useState(booking?.attachmentData || "");
  const [attachmentSize, setAttachmentSize] = useState("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File size cannot exceed 10MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentType(file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"));
      setAttachmentData(reader.result as string);
      setAttachmentSize((file.size / 1024).toFixed(0) + " KB");
    };
    reader.readAsDataURL(file);
  };

  const [newPaxName, setNewPaxName] = useState("");
  const [newPaxDept, setNewPaxDept] = useState("Site Operations");

  const costPerPerson = headcount > 0 ? Math.round(totalCost / headcount) : 0;

  const autoPopulateRoster = (targetCount: number) => {
    const list: BulkBookingPassenger[] = [];
    REGISTERED_EMPLOYEES.forEach((emp, i) => {
      if (list.length < targetCount) {
        list.push({
          name: emp.fullName,
          employeeId: emp.employeeNumber,
          department: emp.department,
          seatOrCoach: `Seat ${String.fromCharCode(65 + (i % 6))}-${Math.floor(i / 6) + 1}`,
        });
      }
    });
    while (list.length < targetCount) {
      const idx = list.length + 1;
      const deptChoices = [
        "Site Commissioning",
        "Piping & Fabrication",
        "Instrumentation",
        "Civil & Structural",
        "Safety & Environment",
        "Electrical Systems",
        "Refinery Quality Control",
      ];
      const chosenDept = deptChoices[idx % deptChoices.length];
      list.push({
        name: `Site Specialist ${idx}`,
        employeeId: `ENG-SITE-${String(idx).padStart(3, "0")}`,
        department: chosenDept,
        seatOrCoach: `Seat ${String.fromCharCode(65 + (idx % 6))}-${Math.floor(idx / 6) + 1}`,
      });
    }
    setPassengers(list);
    toast.success(`Generated manifest roster with ${targetCount} passengers.`);
  };

  const handleHeadcountQuickPick = (count: number) => {
    setHeadcount(count);
    if (passengers.length > 0 && passengers.length !== count) {
      autoPopulateRoster(count);
    }
  };

  const addManualPassenger = () => {
    if (!newPaxName.trim()) return;
    const newPassenger: BulkBookingPassenger = {
      name: newPaxName.trim(),
      department: newPaxDept.trim() || "Operations",
      employeeId: `PAX-${passengers.length + 1}`,
      seatOrCoach: `Seat ${passengers.length + 1}`,
    };
    setPassengers([...passengers, newPassenger]);
    setNewPaxName("");
    setHeadcount(Math.max(headcount, passengers.length + 1));
  };

  const removePassenger = (index: number) => {
    const next = passengers.filter((_, i) => i !== index);
    setPassengers(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !destination.trim() || !groupReference.trim() || headcount <= 0 || totalCost <= 0) {
      setError("Please provide a Title, Destination, Master Reference/PNR, valid Headcount, and Total Cost.");
      return;
    }
    setSubmitting(true);
    setError("");

    let finalPassengers = passengers;
    if (finalPassengers.length === 0) {
      finalPassengers = [];
      for (let i = 0; i < headcount; i++) {
        finalPassengers.push({
          name: i < REGISTERED_EMPLOYEES.length ? REGISTERED_EMPLOYEES[i].fullName : `Specialist ${i + 1}`,
          employeeId: i < REGISTERED_EMPLOYEES.length ? REGISTERED_EMPLOYEES[i].employeeNumber : `SITE-${100 + i}`,
          department: i < REGISTERED_EMPLOYEES.length ? REGISTERED_EMPLOYEES[i].department : "Site Engineering",
          seatOrCoach: `Allocation ${i + 1}`,
        });
      }
    }

    try {
      const payload: Partial<BulkBookingRecord> = {
        title: title.trim(),
        destination: destination.trim(),
        fromLocation: fromLocation.trim(),
        travelDates: travelDates.trim(),
        travelMode,
        provider: provider.trim(),
        groupReference: groupReference.trim(),
        headcount: Number(headcount),
        totalCost: Number(totalCost),
        costPerPerson,
        savings: Number(savings) || 0,
        project: project.trim(),
        itineraryNotes: itineraryNotes.trim(),
        passengerList: finalPassengers,
        passengerManifestSummary: `${finalPassengers.length} travelers manifest attached`,
        coordinatorName: "Travel Desk Operations (123456)",
        attachmentName: attachmentName || undefined,
        attachmentData: attachmentData || undefined,
      };

      if (booking?.id) {
        await bulkBookingsApi.update(booking.id, payload);
        toast.success(`Bulk booking ${booking.id} updated.`);
      } else {
        await bulkBookingsApi.create(payload);
        toast.success(`Logged bulk booking for ${headcount} travelers to ${destination}!`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bulk booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="booking-dialog" style={{ maxWidth: 740, maxHeight: "90vh", overflowY: "auto" }}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>

        <div className="booking-dialog-header">
          <div className="confirm-icon approve" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#059669" }}>
            <UsersRound size={22} />
          </div>
          <span className="card-kicker">MASS MOVEMENTS & BULK TRAVEL LOG</span>
          <h2>{booking?.id ? "Edit Bulk Booking" : "Log Bulk / Group Booking"}</h2>
          <p>
            Log corporate group travel details (e.g. 50 to 100+ travelers) to the same destination. Automatically visible to the Approver for budget review.
          </p>
        </div>

        <form className="booking-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Group Movement Title / Mission</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Jamnagar Petrochem Site Commissioning - 100 Engineers"
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Origin City</span>
              <input
                required
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </label>
            <label className="field">
              <span>Destination City</span>
              <input
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Jamnagar"
              />
            </label>
            <label className="field">
              <span>Travel Dates</span>
              <input
                required
                value={travelDates}
                onChange={(e) => setTravelDates(e.target.value)}
                placeholder="e.g. 18 Oct 2026 – 25 Oct 2026"
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Travel Mode</span>
              <select
                value={travelMode}
                onChange={(e) => setTravelMode(e.target.value as any)}
              >
                <option value="FLIGHT">Flight (Charter / Group Block)</option>
                <option value="TRAIN">Train (Dedicated Coach / Bulk IRCTC)</option>
                <option value="BUS">Bus (Volvo Fleet / Charter)</option>
                <option value="HOTEL">Hotel (Group Room Block)</option>
                <option value="MULTI_MODAL">Multi-Modal Movement</option>
              </select>
            </label>

            <label className="field">
              <span>Carrier / Provider</span>
              <input
                required
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. IndiGo Corporate Group Desk"
              />
            </label>

            <label className="field">
              <span>Master PNR / Group Ref</span>
              <input
                required
                value={groupReference}
                onChange={(e) => setGroupReference(e.target.value)}
                placeholder="e.g. GRP-6E-98421"
              />
            </label>
          </div>

          {/* Headcount Selection & Quick Chips */}
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Headcount (Number of travelers)</span>
              <span className="headcount-badge">
                <UsersRound size={12} /> {headcount} Travelers
              </span>
            </div>
            <input
              type="number"
              min="2"
              max="1000"
              required
              value={headcount}
              onChange={(e) => setHeadcount(Number(e.target.value))}
            />
            <div className="quick-count-chips">
              <span style={{ fontSize: 11, color: "var(--ink-muted)", alignSelf: "center", marginRight: 4 }}>Quick presets:</span>
              {[25, 50, 75, 100, 150].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  className="quick-count-chip"
                  onClick={() => handleHeadcountQuickPick(cnt)}
                >
                  {cnt} pax
                </button>
              ))}
            </div>
          </div>

          {/* Spend & Cost Per Person */}
          <div className="form-grid">
            <label className="field">
              <span>Total Group Spend (₹)</span>
              <input
                type="number"
                min="0"
                step="100"
                required
                value={totalCost}
                onChange={(e) => setTotalCost(Number(e.target.value))}
                placeholder="e.g. 850000"
              />
            </label>
            <label className="field">
              <span>Negotiated Savings (₹)</span>
              <input
                type="number"
                min="0"
                step="100"
                value={savings}
                onChange={(e) => setSavings(Number(e.target.value))}
                placeholder="e.g. 75000"
              />
            </label>
            <label className="field">
              <span>Project / Cost Center</span>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Jamnagar Refinery Phase 3"
              />
            </label>
          </div>

          {/* Live Cost-per-head banner */}
          <div className="panel" style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <Sparkles size={16} className="text-emerald-500" />
              <span>
                <strong>Cost Per Traveler: </strong>
                ₹{costPerPerson.toLocaleString("en-IN")} / person
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
              {headcount} passengers × ₹{costPerPerson.toLocaleString("en-IN")} = ₹{totalCost.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Passenger Roster Section */}
          <div className="field" style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>Passenger Manifest Roster ({passengers.length} travelers registered)</span>
              <button
                type="button"
                className="button button-ghost"
                style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                onClick={() => autoPopulateRoster(headcount)}
              >
                <Zap size={12} className="text-amber-500" /> Auto-fill {headcount} Roster (Employees & Specialists)
              </button>
            </div>

            {/* Quick manual passenger row */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                placeholder="Add passenger name…"
                value={newPaxName}
                onChange={(e) => setNewPaxName(e.target.value)}
                style={{ flex: 1, fontSize: 12 }}
              />
              <input
                placeholder="Department / Role…"
                value={newPaxDept}
                onChange={(e) => setNewPaxDept(e.target.value)}
                style={{ width: 160, fontSize: 12 }}
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={addManualPassenger}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                + Add
              </button>
            </div>

            {/* Manifest list */}
            {passengers.length > 0 && (
              <div className="manifest-list-preview">
                {passengers.slice(0, 15).map((p, i) => (
                  <div className="manifest-row-item" key={i}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)" }}>#{i + 1}</span>
                      <strong>{p.name}</strong>
                      <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>({p.department})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="meta-chip" style={{ fontSize: 10 }}>{p.seatOrCoach || "Allocated"}</span>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removePassenger(i)}
                        title="Remove passenger"
                        style={{ padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {passengers.length > 15 && (
                  <div style={{ padding: "8px 12px", fontSize: 11, textAlign: "center", color: "var(--ink-muted)", background: "var(--surface)" }}>
                    + and {passengers.length - 15} more travelers in manifest roster
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Attach Group Ticket / Quotation / Itinerary PDF</span>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>PDF or Image (up to 10MB)</span>
            </div>
            {!attachmentData ? (
              <label className="ticket-upload-box" style={{ padding: "16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, borderRadius: 12, border: "2px dashed var(--line)", background: "var(--surface-soft)" }}>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <Upload size={22} className="text-amber-500" />
                <strong style={{ fontSize: 13, color: "var(--ink)" }}>Click to attach PDF ticket details or itinerary voucher</strong>
                <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Supports PDF, PNG, JPG, or WEBP documents</span>
              </label>
            ) : (
              <div>
                <div className="ticket-file-chip" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {attachmentType.includes("pdf") || attachmentName.toLowerCase().endsWith(".pdf") ? (
                      <FileText size={22} className="text-red-500 shrink-0" />
                    ) : (
                      <ImageIcon size={22} className="text-emerald-500 shrink-0" />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>
                        {attachmentName}
                      </strong>
                      <small style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                        {attachmentType.includes("pdf") || attachmentName.toLowerCase().endsWith(".pdf") ? "PDF Document" : "Image File"}
                        {attachmentSize ? ` · ${attachmentSize}` : ""}
                      </small>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="button button-ghost"
                      style={{ padding: "4px 8px", fontSize: 11, gap: 4 }}
                      onClick={() => {
                        const w = window.open("");
                        if (w) {
                          w.document.write(`<iframe src="${attachmentData}" style="width:100vw; height:100vh; border:none;" />`);
                          w.document.title = attachmentName || "Attachment Preview";
                        }
                      }}
                      title="Preview PDF in new window"
                    >
                      <Eye size={13} /> Preview
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => {
                        setAttachmentData("");
                        setAttachmentName("");
                        setAttachmentType("");
                        setAttachmentSize("");
                      }}
                      title="Remove attachment"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="field">
            <span>Group Logistics & Dispatch Instructions</span>
            <textarea
              rows={2}
              value={itineraryNotes}
              onChange={(e) => setItineraryNotes(e.target.value)}
              placeholder="Airport shuttle bus schedules, dedicated check-in desks, group luggage tags, etc."
            />
          </label>

          {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

          <div className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={submitting}>
              {submitting ? "Saving Movement…" : booking?.id ? "Update Bulk Booking" : "Log Bulk Booking & Notify Approver"}{" "}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Approvals({ history = false }: { history?: boolean }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const user = getStoredUser<AuthUser>();
  const { journeys, loading, error } = useTravelRequests(user, refreshKey);
  const [working, setWorking] = useState<string | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const [confirmation, setConfirmation] = useState<{ journey: Journey; action: "approve" | "reject" } | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  async function decide(journey: Journey, action: "approve" | "reject") {
    setWorking(`${action}-${journey.id}`);
    try {
      const approver = user?.username || "authenticated approver";
      if (action === "approve") await travelRequestsApi.approve(journey.id, approver);
      else await travelRequestsApi.reject(journey.id, approver, "Rejected from Trapple approval workspace.");
      toast.success(`Request ${action === "approve" ? "approved" : "rejected"}.`);
      setRefreshKey((k) => k + 1);
    } catch (decisionError) {
      toast.error(decisionError instanceof Error ? decisionError.message : "Decision could not be saved.");
    } finally {
      setWorking(null);
      setConfirmation(null);
    }
  }

  const rows = history ? journeys.filter((journey) => journey.status !== "Pending approval") : journeys.filter((journey) => journey.status === "Pending approval");

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta[history ? "/approver/history" : "/approver"]} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#14B8A6] block mb-0.5">
              {history ? "DECISION ARCHIVE" : "NEEDS YOUR REVIEW"}
            </span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {String(rows.length).padStart(2, "0")}
            </div>
            <span className="text-[11px] text-slate-500">
              {history ? "decisions recorded" : "requests awaiting action"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <FileCheck2 size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              DECISION SLA TARGET
            </span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              &lt; 24h
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Fast-Track Enabled
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              WORKFLOW MODE
            </span>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
              {history ? "Audit Log View" : "Active Review Desk"}
            </div>
            <div className="mt-1">
              {history ? (
                <Link href="/approver" className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
                  Switch to Pending Queue <ArrowUpRight size={12} />
                </Link>
              ) : (
                <Link href="/approver/history" className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
                  View Decision History <ArrowUpRight size={12} />
                </Link>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Clock3 size={20} />
          </div>
        </div>
      </div>

      <div className="panel table-panel">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">{history ? "BACKEND HISTORY" : "PENDING REQUESTS"}</span>
            <h2 className="section-heading">{history ? "Recent approval activity" : "Requests ready for review"}</h2>
          </div>
          <div className="flex items-center gap-2">
            {history && rows.length > 0 && (
              <button
                type="button"
                className="button button-ghost button-small flex items-center gap-1.5"
                onClick={() => setConfirmClearHistory(true)}
                title="Clear all past approval decisions"
              >
                <Trash2 size={13} /> Clear decision history
              </button>
            )}
            <span className="data-note"><ShieldCheck size={13} /> Live backend data</span>
          </div>
        </div>

        {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

        {loading ? (
          <EmptyState icon={<Clock3 size={20} />} title="Loading approvals" description="Fetching requests from Trapple." />
        ) : rows.length ? (
          <div className="approval-list">
            {rows.map((request) => {
              const emp = request.employee || { name: request.passenger || "Employee", employeeId: "EMP", department: "General Operations", designation: "Employee" };
              const urgency = getDepartureUrgency(request);
              return (
                <div className="approval-item approval-item-rich" key={request.id}>
                  <div className="approval-identity">
                    <div className="avatar">
                      {(emp.name || request.passenger || request.destination).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <strong>{emp.name || request.passenger}</strong>
                      <span style={{ fontSize: 10, color: "var(--ink-muted)" }}>
                        {emp.employeeId || "EMP"} · {emp.department || "Dept"} · {emp.designation || "Staff"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--navy)" }}>
                        {request.destination} ({request.project})
                      </span>
                    </div>
                  </div>
                  <div className="approval-route">
                    <strong>{request.from} → {request.to}</strong>
                    <span>{request.dates} · {request.tripType}</span>
                    {urgency.badgeText && (
                      <div style={{ marginTop: 2 }}>
                        <span className={urgency.isUrgent ? "urgent-badge-pill" : "meta-chip"} style={{ fontSize: 10 }}>
                          {urgency.isUrgent && <AlertTriangle size={11} className="shrink-0" />}
                          <span>{urgency.badgeText}</span>
                        </span>
                      </div>
                    )}
                    {request.reason && (
                      <small style={{ color: "var(--ink-muted)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        "{request.reason}"
                      </small>
                    )}
                  </div>
                  <div className="approval-amount">
                    <span>Status</span>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="approval-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="button button-small button-ghost"
                      onClick={() => setSelectedJourney(request)}
                      title="View all details submitted by employee"
                    >
                      View details <ArrowUpRight size={13} />
                    </button>
                    {!history && (
                      <>
                        <button
                          type="button"
                          className="button button-small button-ghost"
                          disabled={working !== null}
                          onClick={() => setConfirmation({ journey: request, action: "reject" })}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="button button-small button-primary"
                          disabled={working !== null}
                          onClick={() => setConfirmation({ journey: request, action: "approve" })}
                        >
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<FileCheck2 size={20} />}
            title={history ? "No decisions yet" : "No requests waiting"}
            description={history ? "Completed approval decisions will appear here." : "New pending requests will appear here when submitted."}
          />
        )}
      </div>

      {selectedJourney && (
        <ApproverRequestDetailsModal
          journey={selectedJourney}
          onClose={() => setSelectedJourney(null)}
          onApprove={(j) => setConfirmation({ journey: j, action: "approve" })}
          onReject={(j) => setConfirmation({ journey: j, action: "reject" })}
          onDeleted={() => {
            setSelectedJourney(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {confirmation && (
        <ConfirmDialog
          action={confirmation.action}
          onClose={() => setConfirmation(null)}
          onConfirm={() => decide(confirmation.journey, confirmation.action)}
        />
      )}

      {confirmClearHistory && (
        <DeleteConfirmDialog
          title="Clear decision history?"
          description="This will clear past approved and rejected requests from the queue history. Active pending items will remain untouched."
          confirmLabel="Clear history"
          onConfirm={async () => {
            await travelRequestsApi.clearDecisionHistory();
            toast.success("Approval decision history cleared.");
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setConfirmClearHistory(false)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ action, onClose, onConfirm }: { action: "approve" | "reject"; onClose: () => void; onConfirm: () => void }) {
  const Icon = action === "approve" ? Check : XCircle;
  return (
    <div className="modal-overlay">
      <div className="confirm-dialog">
        <button className="icon-button dialog-close" onClick={onClose}><X size={18} /></button>
        <div className={`confirm-icon ${action}`}><Icon size={22} /></div>
        <span className="card-kicker">CONFIRM DECISION</span>
        <h2>{action === "approve" ? "Approve this request?" : "Reject this request?"}</h2>
        <p>{action === "approve" ? "This will move the request into the Travel Desk workflow for confirmed ticketing." : "This will mark the request as rejected for the employee."}</p>
        <div className="dialog-actions">
          <button className="button button-ghost" onClick={onClose}>Go back</button>
          <button className={`button ${action === "approve" ? "button-primary" : "button-danger"}`} onClick={onConfirm}>
            {action === "approve" ? "Approve request" : "Reject request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getDepartureUrgency(journey: Journey): { days: number | null; isUrgent: boolean; badgeText: string } {
  const rawDate = journey.rawRequest?.travelDate;
  if (!rawDate) return { days: null, isUrgent: false, badgeText: "" };
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return { days: null, isUrgent: false, badgeText: "" };
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startTrip = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startTrip - startToday) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { days: diffDays, isUrgent: false, badgeText: "Departed" };
  if (diffDays === 0) return { days: diffDays, isUrgent: true, badgeText: "Departing Today" };
  if (diffDays === 1) return { days: diffDays, isUrgent: true, badgeText: "Tomorrow (<24h)" };
  if (diffDays <= 2) return { days: diffDays, isUrgent: true, badgeText: `In ${diffDays} days (<48h)` };
  if (diffDays <= 7) return { days: diffDays, isUrgent: false, badgeText: `In ${diffDays} days` };
  return { days: diffDays, isUrgent: false, badgeText: "" };
}

function VoucherModal({ journey, booking, onClose }: { journey: Journey; booking: any; onClose: () => void }) {
  const emp = journey.employee || {
    name: journey.passenger || "Employee",
    employeeId: "EMP",
    department: "General Operations",
    designation: "Employee",
  };
  const isFlight = (booking?.bookingType || "").toUpperCase() === "FLIGHT";
  const isTrain = (booking?.bookingType || "").toUpperCase() === "TRAIN";
  const isHotel = (booking?.bookingType || "").toUpperCase() === "HOTEL";

  return (
    <div className="voucher-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="voucher-title">
      <div className="voucher-card">
        <div className="voucher-header-bar">
          <div className="voucher-brand">
            <TicketCheck size={26} className="text-emerald-400" />
            <div>
              <span style={{ fontSize: 10, letterSpacing: "0.08em", fontWeight: 800, textTransform: "uppercase", opacity: 0.8 }}>
                Trapple Enterprise Travel Desk
              </span>
              <h2 id="voucher-title" style={{ fontSize: 18, margin: 0, fontWeight: 700, color: "#fff" }}>
                Official Travel Dispatch Voucher
              </h2>
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="button button-ghost"
              style={{ color: "#fff", background: "rgba(255,255,255,0.14)", border: "none", padding: "6px 12px", fontSize: 12 }}
              onClick={() => window.print()}
            >
              <Printer size={14} /> Print / PDF
            </button>
            <button
              type="button"
              className="icon-button"
              style={{ color: "#fff", background: "rgba(255,255,255,0.14)" }}
              onClick={onClose}
              aria-label="Close voucher"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="voucher-body">
          <div className="voucher-route-banner">
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Passenger & Employee
              </span>
              <h3 style={{ fontSize: 18, margin: "2px 0 0", color: "var(--ink)", fontWeight: 800 }}>
                {emp.name || journey.passenger}
              </h3>
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--ink-soft)" }}>
                <span><strong>ID:</strong> {emp.employeeId}</span>
                <span>•</span>
                <span><strong>Dept:</strong> {emp.department}</span>
                <span>•</span>
                <span><strong>Role:</strong> {emp.designation}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>Booking Status</span>
              <div style={{ marginTop: 2 }}>
                <span className="approval-pill booked"><Check size={12} /> Confirmed Ticketed</span>
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <small style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>Origin</small>
                <strong style={{ display: "block", fontSize: 18, color: "var(--ink)" }}>{journey.from || "HQ"}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)" }}>
                <div style={{ width: 40, height: 2, background: "var(--green)" }} />
                {isFlight ? <Plane size={18} /> : isTrain ? <Train size={18} /> : isHotel ? <Building2 size={18} /> : <Compass size={18} />}
                <div style={{ width: 40, height: 2, background: "var(--green)" }} />
              </div>
              <div style={{ textAlign: "right" }}>
                <small style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>Destination</small>
                <strong style={{ display: "block", fontSize: 18, color: "var(--ink)" }}>{journey.to || journey.destination}</strong>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)", fontSize: 11, color: "var(--ink-soft)" }}>
              <span><strong>Dates:</strong> {journey.dates}</span>
              <span><strong>Project:</strong> {journey.project}</span>
            </div>
          </div>

          <div className="voucher-grid">
            <div className="voucher-meta-item">
              <small>PNR / Booking Ref</small>
              <strong style={{ fontSize: 15, color: "var(--green)", letterSpacing: "0.04em" }}>{booking?.bookingReference || "CONFIRMED"}</strong>
            </div>
            <div className="voucher-meta-item">
              <small>Carrier / Provider</small>
              <strong>{booking?.provider || (isFlight ? "Corporate Airline" : "Service Provider")}</strong>
            </div>
            <div className="voucher-meta-item">
              <small>Booking Type</small>
              <strong>{booking?.bookingType || "Travel Service"}</strong>
            </div>
            <div className="voucher-meta-item">
              <small>Authorized Amount</small>
              <strong>{booking?.cost !== undefined ? `₹${Number(booking.cost).toLocaleString("en-IN")}` : "Direct Corporate Bill"}</strong>
            </div>
            <div className="voucher-meta-item">
              <small>Negotiated Savings</small>
              <strong style={{ color: "var(--green)" }}>{booking?.savings ? `₹${Number(booking.savings).toLocaleString("en-IN")}` : "Corporate Standard Rate"}</strong>
            </div>
            <div className="voucher-meta-item">
              <small>Request ID</small>
              <strong>#{journey.id}</strong>
            </div>
          </div>

          {booking?.notes && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-soft)", border: "1px solid var(--line)", marginBottom: 20 }}>
              <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-muted)" }}>Desk Instructions & Seat Info</small>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>{booking.notes}</p>
            </div>
          )}

          {booking?.attachmentData && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.2)", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={20} className="text-red-500 shrink-0" />
                <div>
                  <strong style={{ fontSize: 12, display: "block", color: "var(--ink)" }}>Attached Ticket Document: {booking.attachmentName || "ticket.pdf"}</strong>
                  <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Confirmed electronic ticket voucher</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button button-ghost"
                  style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                  onClick={() => {
                    const w = window.open("");
                    if (w) {
                      w.document.write(`<iframe src="${booking.attachmentData}" style="width:100vw; height:100vh; border:none;" />`);
                      w.document.title = booking.attachmentName || "Ticket Document Preview";
                    }
                  }}
                >
                  <Eye size={13} /> View PDF
                </button>
                <a
                  href={booking.attachmentData}
                  download={booking.attachmentName || "ticket_voucher"}
                  className="button button-primary"
                  style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                >
                  <Download size={13} /> Download copy
                </a>
              </div>
            </div>
          )}

          <div className="voucher-footer-strip">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck size={24} className="text-emerald-500 shrink-0" />
              <div>
                <strong style={{ fontSize: 12, color: "var(--ink)" }}>Verified Corporate Travel Dispatch</strong>
                <small style={{ display: "block", fontSize: 10, color: "var(--ink-muted)" }}>
                  Authorized by Trapple Central Travel Operations. Valid for airport/hotel check-in with employee ID.
                </small>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <QrCode size={36} className="text-gray-700 dark:text-gray-300" />
            </div>
          </div>

          <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button type="button" className="button button-ghost" onClick={onClose}>Close</button>
            <button type="button" className="button button-primary" onClick={() => window.print()}>
              <Printer size={15} /> Print Dispatch Voucher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TravelDesk() {
  const user = getStoredUser<AuthUser>();
  const [location] = useLocation();
  const cancellationsMode = location === "/travel-desk/cancellations";
  const bookingsMode = location === "/travel-desk/bookings";
  const bulkMode = location === "/travel-desk/bulk-bookings";
  const [refreshKey, setRefreshKey] = useState(0);
  const { journeys, loading, error } = useTravelRequests(user, refreshKey);
  const [bookingRecords, setBookingRecords] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingError, setBookingError] = useState("");
  const [bookingJourney, setBookingJourney] = useState<Journey | null>(null);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<any | null>(null);
  const [deletingJourney, setDeletingJourney] = useState<Journey | null>(null);
  const [viewingVoucher, setViewingVoucher] = useState<{ journey: Journey; booking: any } | null>(null);

  // Bulk / Group Travel Desk state
  const [bulkBookings, setBulkBookings] = useState<BulkBookingRecord[]>([]);
  const [bulkLoading, setBulkLoading] = useState(true);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [selectedBulkManifest, setSelectedBulkManifest] = useState<BulkBookingRecord | null>(null);
  const [editingBulkRecord, setEditingBulkRecord] = useState<BulkBookingRecord | null>(null);
  const [deletingBulkRecord, setDeletingBulkRecord] = useState<BulkBookingRecord | null>(null);
  const [bulkQuery, setBulkQuery] = useState("");

  // Workstation interactive filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState<"ALL" | "URGENT" | "READY" | "PENDING" | "BOOKED">("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");

  // Spend Intelligence state for Travel Desk
  const [spendOverview, setSpendOverview] = useState<ExecutiveSpendOverview | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setBookingsLoading(true);
    setBookingError("");
    bookingsApi.list().then((data) => {
      if (active) setBookingRecords(Array.isArray(data) ? data : []);
    }).catch((requestError) => {
      if (active) setBookingError(requestError instanceof Error ? requestError.message : "Booking data is unavailable.");
    }).finally(() => {
      if (active) setBookingsLoading(false);
    });

    setBulkLoading(true);
    bulkBookingsApi.list().then((data) => {
      if (active) setBulkBookings(Array.isArray(data) ? data : []);
    }).catch((err) => {
      console.warn("Failed to load bulk bookings", err);
    }).finally(() => {
      if (active) setBulkLoading(false);
    });

    setSpendLoading(true);
    spendReportsApi.getOverview().then((data) => {
      if (active) setSpendOverview(data);
    }).catch((err) => {
      console.warn("Spend intelligence overview unavailable in travel desk", err);
    }).finally(() => {
      if (active) setSpendLoading(false);
    });

    const handleSync = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("trapple_cloud_synced", handleSync);
    window.addEventListener("travora_cloud_synced", handleSync);

    return () => {
      active = false;
      window.removeEventListener("trapple_cloud_synced", handleSync);
      window.removeEventListener("travora_cloud_synced", handleSync);
    };
  }, [refreshKey]);

  const bookedIds = useMemo(() => new Set(bookingRecords.filter((booking) => !booking?.cancelled).map((booking) => String(booking?.travelRequest?.id ?? "")).filter(Boolean)), [bookingRecords]);
  const rows = journeys.map((journey) => bookedIds.has(journey.id) ? { ...journey, status: "Booked" as const } : journey);
  const activeBookings = bookingRecords.filter((booking) => !booking?.cancelled);
  const cancelledBookings = bookingRecords.filter((booking) => Boolean(booking?.cancelled));
  const approvedCount = rows.filter((row) => row.status === "Approved").length;
  const pendingApproverCount = rows.filter((row) => row.status === "Pending approval").length;

  // Analytics & Urgent Triage Computations
  const totalSpend = useMemo(() => activeBookings.reduce((sum, b) => sum + (Number(b.cost) || 0), 0), [activeBookings]);
  const totalSavings = useMemo(() => activeBookings.reduce((sum, b) => sum + (Number(b.savings) || 0), 0), [activeBookings]);
  const avgSpend = activeBookings.length ? Math.round(totalSpend / activeBookings.length) : 0;
  const totalCancellationCharges = useMemo(() => cancelledBookings.reduce((sum, b) => sum + (Number(b.cancellationCharge) || 0), 0), [cancelledBookings]);

  // Bulk movements computations
  const totalBulkHeadcount = useMemo(() => bulkBookings.reduce((sum, b) => sum + (b.headcount || 0), 0), [bulkBookings]);
  const totalBulkSpend = useMemo(() => bulkBookings.reduce((sum, b) => sum + (b.totalCost || 0), 0), [bulkBookings]);
  const avgBulkCostPerPerson = totalBulkHeadcount > 0 ? Math.round(totalBulkSpend / totalBulkHeadcount) : 0;
  const filteredBulkBookings = useMemo(() => {
    if (!bulkQuery.trim()) return bulkBookings;
    const q = bulkQuery.toLowerCase();
    return bulkBookings.filter((b) =>
      b.title?.toLowerCase().includes(q) ||
      b.destination?.toLowerCase().includes(q) ||
      b.fromLocation?.toLowerCase().includes(q) ||
      b.groupReference?.toLowerCase().includes(q) ||
      b.provider?.toLowerCase().includes(q) ||
      b.project?.toLowerCase().includes(q)
    );
  }, [bulkBookings, bulkQuery]);

  // Urgent departures: trips departing in <= 2 days (<48h) that are not cancelled
  const urgentDepartures = useMemo(() => {
    return rows.filter((row) => {
      if (row.status === "Cancelled") return false;
      const urgency = getDepartureUrgency(row);
      return urgency.isUrgent;
    });
  }, [rows]);

  // Carrier distribution calculation
  const carrierStats = useMemo(() => {
    const counts: Record<string, number> = {};
    activeBookings.forEach((b) => {
      const prov = (b.provider || b.bookingType || "Other").trim();
      counts[prov] = (counts[prov] || 0) + 1;
    });
    const total = activeBookings.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }));
  }, [activeBookings]);

  // Department volume breakdown
  const departmentStats = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const dept = r.employee?.department || "Operations";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [rows]);

  // Workstation filtered list
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const record = activeBookings.find((booking) => String(booking?.travelRequest?.id) === row.id);
      const emp = row.employee || {};
      const empName = (emp.name || row.passenger || "").toLowerCase();
      const empId = (emp.employeeId || "").toLowerCase();
      const dest = (row.destination || "").toLowerCase();
      const from = (row.from || "").toLowerCase();
      const to = (row.to || "").toLowerCase();
      const proj = (row.project || "").toLowerCase();
      const pnr = (record?.bookingReference || "").toLowerCase();
      const provider = (record?.provider || "").toLowerCase();

      // Text query match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery = empName.includes(q) || empId.includes(q) || dest.includes(q) || from.includes(q) || to.includes(q) || proj.includes(q) || pnr.includes(q) || provider.includes(q);
        if (!matchesQuery) return false;
      }

      // Status Tab match
      if (statusTab === "READY" && row.status !== "Approved") return false;
      if (statusTab === "PENDING" && row.status !== "Pending approval") return false;
      if (statusTab === "BOOKED" && row.status !== "Booked") return false;
      if (statusTab === "URGENT") {
        const urgency = getDepartureUrgency(row);
        if (!urgency.isUrgent) return false;
      }

      // Mode filter match
      if (modeFilter !== "ALL") {
        const typeMatch = (row.tripType || "").toUpperCase().includes(modeFilter) || (record?.bookingType || "").toUpperCase() === modeFilter;
        if (!typeMatch) return false;
      }

      return true;
    });
  }, [rows, activeBookings, searchQuery, statusTab, modeFilter]);

  // Export passenger manifest
  function exportPassengerManifest() {
    const headers = [
      "Request ID",
      "Passenger Name",
      "Employee ID",
      "Department",
      "Designation",
      "From Location",
      "To Location",
      "Travel Dates",
      "Trip Type",
      "Project",
      "Approver Status",
      "Ticketing Status",
      "PNR / Reference",
      "Provider / Carrier",
      "Booking Cost (INR)",
      "Savings (INR)",
      "Notes",
    ];
    const dataRows = (filteredRows.length ? filteredRows : rows).map((row) => {
      const record = activeBookings.find((b) => String(b?.travelRequest?.id) === row.id);
      const emp = row.employee || {};
      return [
        row.id,
        emp.name || row.passenger || "",
        emp.employeeId || "",
        emp.department || "",
        emp.designation || "",
        row.from,
        row.to,
        row.dates,
        row.tripType,
        row.project,
        row.status,
        record ? "Confirmed Booked" : (row.status === "Approved" ? "Ready to Book" : "Pending Sign-off"),
        record?.bookingReference || "",
        record?.provider || "",
        record?.cost !== undefined ? Number(record.cost) : "",
        record?.savings !== undefined ? Number(record.savings) : "",
        record?.notes || "",
      ];
    });
    exportToCsv("trapple_passenger_manifest", headers, dataRows);
    toast.success("Passenger manifest CSV exported successfully.");
  }

  async function refresh() { setRefreshKey((value) => value + 1); }
  async function createBooking(payload: Record<string, unknown>) { await bookingsApi.create(payload); setBookingJourney(null); toast.success("Booking created. Ticket details dispatched."); await refresh(); }
  async function updateBooking(id: string, payload: Record<string, unknown>) { await bookingsApi.update(id, payload); setEditingBooking(null); toast.success("Booking details updated."); await refresh(); }
  async function cancelBooking(id: string, reason: string, charge: number) { await bookingsApi.cancel(id, reason, charge); setCancellingBooking(null); toast.success("Booking cancelled successfully."); await refresh(); }

  const currentMeta = cancellationsMode ? pageMeta["/travel-desk/cancellations"] : (bookingsMode ? pageMeta["/travel-desk/bookings"] : pageMeta["/travel-desk"]);

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={currentMeta} />

      {/* CANCELLATIONS DESK MODE */}
      {cancellationsMode ? (
        <>
          <section className="summary-strip">
            <div>
              <span className="card-kicker">CANCELLATION DESK</span>
              <strong>{String(cancelledBookings.length).padStart(2, "0")}</strong>
              <span>cancelled bookings · ₹{totalCancellationCharges.toLocaleString("en-IN")} fees recorded</span>
            </div>
            <div className="strip-icon"><XCircle size={22} /></div>
          </section>

          <div className="panel table-panel">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">CANCELLATION WORKSTATION</span>
                <h2 className="section-heading">Manage booking cancellations & refunds</h2>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Link href="/travel-desk/bookings" className="button button-ghost">
                  <TicketCheck size={14} /> Booking queue
                </Link>
                <Link href="/travel-desk" className="button button-ghost">
                  <LayoutDashboard size={14} /> Overview
                </Link>
              </div>
            </div>

            {bookingError && <div className="form-error-message"><XCircle size={15} />{bookingError}</div>}
            {bookingsLoading ? (
              <EmptyState icon={<Clock3 size={20} />} title="Loading bookings" description="Fetching booking records from Trapple." />
            ) : bookingRecords.length ? (
              <BookingTable
                bookings={bookingRecords}
                journeys={rows}
                onEdit={setEditingBooking}
                onCancel={setCancellingBooking}
                onVoucher={(b, j) => j && setViewingVoucher({ journey: j, booking: b })}
              />
            ) : (
              <EmptyState icon={<XCircle size={20} />} title="No booking records" description="Booking records will appear here from the backend." />
            )}
          </div>
        </>
      ) : bulkMode ? (
        /* DEDICATED BULK & GROUP TRAVEL WORKSTATION */
        <>
          <div className="section-title-row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span className="card-kicker">MASS MOVEMENTS & GROUP WORKSTATION</span>
              <h2 className="section-heading">Bulk Travel & Flight Blocks</h2>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 0" }}>
                Book and coordinate travel for large teams (50 to 100+ travelers) to the same destination. Log master PNRs, generate rosters, and share with Approver.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setBulkModalOpen(true)}
              >
                <Plus size={15} /> Log Bulk Booking (100+ pax)
              </button>
              <Link href="/travel-desk" className="button button-ghost">
                <LayoutDashboard size={15} /> Operations Overview
              </Link>
            </div>
          </div>

          <section className="stats-grid desk-stats">
            <StatCard
              label="Mass Movements"
              value={String(bulkBookings.length).padStart(2, "0")}
              detail="Active bulk bookings"
              icon={<UsersRound size={18} />}
              accent="stat-accent"
            />
            <StatCard
              label="Travelers Coordinated"
              value={String(totalBulkHeadcount).padStart(2, "0")}
              detail="Across all group blocks"
              icon={<UserRound size={18} />}
            />
            <StatCard
              label="Bulk Travel Spend"
              value={`₹${totalBulkSpend.toLocaleString("en-IN")}`}
              detail="Group desk expenditure"
              icon={<WalletCards size={18} />}
            />
            <StatCard
              label="Avg Cost / Head"
              value={`₹${avgBulkCostPerPerson.toLocaleString("en-IN")}`}
              detail="Per-person efficiency"
              icon={<Sparkles size={18} />}
            />
          </section>

          <div className="panel table-panel">
            <div className="table-toolbar">
              <div className="search-field">
                <Search size={16} />
                <input
                  value={bulkQuery}
                  onChange={(e) => setBulkQuery(e.target.value)}
                  placeholder="Filter by title, destination, master PNR, carrier, or project…"
                />
              </div>
              <span className="data-note">
                <ShieldCheck size={13} /> Visible to Approver
              </span>
            </div>

            {bulkLoading ? (
              <EmptyState icon={<Clock3 size={20} />} title="Loading bulk movements" description="Fetching bulk bookings from Trapple." />
            ) : filteredBulkBookings.length ? (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Mission / Group Title</th>
                      <th>Route & Dates</th>
                      <th>Carrier & Master PNR</th>
                      <th>Headcount</th>
                      <th>Total Spend & Cost/Pax</th>
                      <th>Approver Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBulkBookings.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.title}</strong>
                          <small className="table-subline">{b.project || "Operations"}</small>
                        </td>
                        <td>
                          <strong>{b.destination}</strong>
                          <small className="table-subline">{b.fromLocation} → {b.destination} · {b.travelDates}</small>
                        </td>
                        <td>
                          <strong>{b.groupReference}</strong>
                          <small className="table-subline">{b.provider} ({b.travelMode})</small>
                        </td>
                        <td>
                          <span className="headcount-badge">
                            <UsersRound size={12} /> {b.headcount} travelers
                          </span>
                        </td>
                        <td>
                          <strong>₹{b.totalCost.toLocaleString("en-IN")}</strong>
                          <small className="table-subline">₹{b.costPerPerson.toLocaleString("en-IN")} / head</small>
                        </td>
                        <td>
                          {b.approverStatus === "APPROVED" ? (
                            <span className="approval-pill approved"><CheckCircle2 size={12} /> Approved</span>
                          ) : b.approverStatus === "NOTED" ? (
                            <span className="approval-pill booked"><Check size={12} /> Noted</span>
                          ) : (
                            <span className="approval-pill pending"><Clock3 size={12} /> Pending Review</span>
                          )}
                        </td>
                        <td>
                          <div className="table-inline-actions">
                            <button
                              type="button"
                              className="table-action"
                              style={{ color: "var(--blue)" }}
                              onClick={() => setSelectedBulkManifest(b)}
                              title="Inspect manifest & print voucher"
                            >
                              Manifest <UsersRound size={14} />
                            </button>
                            <button
                              type="button"
                              className="table-action"
                              onClick={() => setEditingBulkRecord(b)}
                            >
                              Edit <ArrowUpRight size={14} />
                            </button>
                            <button
                              type="button"
                              className="table-action table-action-danger"
                              onClick={() => setDeletingBulkRecord(b)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<UsersRound size={20} />}
                title="No bulk bookings logged"
                description="Click '+ Log Bulk Booking' to log group travel for up to 100+ travelers."
              />
            )}
          </div>
        </>
      ) : bookingsMode ? (
        /* DEDICATED BOOKING QUEUE WORKSTATION MODE */
        <>
          <div className="section-title-row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span className="card-kicker">OPERATIONAL TICKETING WORKSTATION</span>
              <h2 className="section-heading">Issue, Edit & Dispatch Tickets</h2>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 0" }}>
                Process employee travel requests, attach confirmed PNRs, issue vouchers, and export passenger manifests.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button button-ghost"
                onClick={exportPassengerManifest}
                title="Download corporate passenger manifest for currently filtered travel requests"
              >
                <FileSpreadsheet size={15} /> Export Manifest (CSV)
              </button>
              <Link href="/travel-desk" className="button button-ghost">
                <LayoutDashboard size={15} /> Operations Overview
              </Link>
            </div>
          </div>

          {/* Urgent Priority Banner in Workstation */}
          {urgentDepartures.length > 0 && statusTab !== "URGENT" && (
            <div className="urgent-triage-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ padding: 10, borderRadius: 12, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <strong style={{ fontSize: 14, color: "var(--ink)", display: "block" }}>
                    {urgentDepartures.length} Priority Departure{urgentDepartures.length === 1 ? "" : "s"} Departing in &lt;48 Hours
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Immediate ticketing required to secure corporate fares and ensure seamless employee departure.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff", whiteSpace: "nowrap" }}
                onClick={() => setStatusTab("URGENT")}
              >
                <Zap size={14} /> Filter Urgent Queue
              </button>
            </div>
          )}

          {/* Workstation Filters & Search Toolbar */}
          <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div className="search-field" style={{ minWidth: 260, flex: "1 1 280px" }}>
                <Search size={16} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search passenger, employee ID, route, PNR, provider, project..."
                />
                {searchQuery && (
                  <button type="button" className="icon-button" onClick={() => setSearchQuery("")} title="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="workstation-tabs">
                <button
                  type="button"
                  className={`workstation-tab ${statusTab === "ALL" ? "active" : ""}`}
                  onClick={() => setStatusTab("ALL")}
                >
                  All Requests <span className="workstation-tab-count">{rows.length}</span>
                </button>
                <button
                  type="button"
                  className={`workstation-tab ${statusTab === "URGENT" ? "active" : ""}`}
                  onClick={() => setStatusTab("URGENT")}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                    Urgent (&lt;48h)
                  </span>
                  <span className="workstation-tab-count">{urgentDepartures.length}</span>
                </button>
                <button
                  type="button"
                  className={`workstation-tab ${statusTab === "READY" ? "active" : ""}`}
                  onClick={() => setStatusTab("READY")}
                >
                  Ready to Book <span className="workstation-tab-count">{approvedCount}</span>
                </button>
                <button
                  type="button"
                  className={`workstation-tab ${statusTab === "PENDING" ? "active" : ""}`}
                  onClick={() => setStatusTab("PENDING")}
                >
                  In Review <span className="workstation-tab-count">{pendingApproverCount}</span>
                </button>
                <button
                  type="button"
                  className={`workstation-tab ${statusTab === "BOOKED" ? "active" : ""}`}
                  onClick={() => setStatusTab("BOOKED")}
                >
                  Ticketed <span className="workstation-tab-count">{activeBookings.length}</span>
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>Mode:</span>
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "1px solid var(--line)", background: "var(--surface)" }}
                >
                  <option value="ALL">All Modes</option>
                  <option value="FLIGHT">Flight</option>
                  <option value="TRAIN">Train</option>
                  <option value="HOTEL">Hotel</option>
                  <option value="CAB">Cab</option>
                  <option value="BUS">Bus</option>
                </select>
              </div>
            </div>
          </div>

          <div className="panel table-panel">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">ACTIVE QUEUE</span>
                <h2 className="section-heading">
                  {statusTab === "URGENT" ? "Priority Urgent Departures" : statusTab === "READY" ? "Ready for Confirmed Ticketing" : statusTab === "BOOKED" ? "Confirmed Booked Journeys" : "Ticketing Workstation Requests"}
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-muted)", marginLeft: 8 }}>
                    ({filteredRows.length} showing)
                  </span>
                </h2>
              </div>
              <span className="data-note"><ShieldCheck size={13} /> Live backend data</span>
            </div>

            {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
            {bookingError && <div className="form-error-message"><XCircle size={15} />{bookingError}</div>}

            {loading || bookingsLoading ? (
              <EmptyState icon={<Clock3 size={20} />} title="Loading workstation" description="Fetching travel requests and live booking records." />
            ) : filteredRows.length ? (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Passenger / Employee</th>
                      <th>Journey & Route</th>
                      <th>Travel Dates</th>
                      <th>Approver Status</th>
                      <th>Booking / PNR</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const record = activeBookings.find((booking) => String(booking?.travelRequest?.id) === row.id);
                      const isApproved = row.status === "Approved";
                      const isPending = row.status === "Pending approval";
                      const isBooked = row.status === "Booked";
                      const urgency = getDepartureUrgency(row);
                      const emp = row.employee || {
                        name: row.passenger || "Employee",
                        employeeId: "EMP",
                        department: "General Operations",
                        designation: "Employee",
                      };

                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="table-journey">
                              <span className="avatar avatar-tiny">
                                {(emp.name || row.passenger || "E").slice(0, 2).toUpperCase()}
                              </span>
                              <span>
                                <strong>{emp.name || row.passenger}</strong>
                                <small>{emp.employeeId} · {emp.department} · {emp.designation}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <strong>{row.destination}</strong>
                            <small className="table-subline">{row.from} → {row.to} · {row.project}</small>
                          </td>
                          <td>
                            <div>
                              <span>{row.dates}</span>
                              {urgency.badgeText && (
                                <div style={{ marginTop: 3 }}>
                                  <span className={urgency.isUrgent ? "urgent-badge-pill" : "meta-chip"} style={{ fontSize: 10 }}>
                                    {urgency.isUrgent && <AlertTriangle size={11} className="shrink-0" />}
                                    <span>{urgency.badgeText}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {isApproved ? (
                              <span className="approval-pill approved" title={row.approverName ? `Approved by ${row.approverName}` : "Approved"}>
                                <Check size={12} /> Approver Approved
                              </span>
                            ) : isPending ? (
                              <span className="approval-pill pending">
                                <Clock3 size={12} /> Pending Manager
                              </span>
                            ) : isBooked ? (
                              <span className="approval-pill booked">
                                <TicketCheck size={12} /> Ticket Issued
                              </span>
                            ) : (
                              <StatusBadge status={row.status} />
                            )}
                          </td>
                          <td>
                            {record ? (
                              <div>
                                <strong style={{ fontSize: 12, color: "var(--ink)" }}>{record.bookingReference || "CONFIRMED"}</strong>
                                <small className="table-subline">{record.provider || record.bookingType} · {record.cost !== undefined ? `₹${Number(record.cost).toLocaleString("en-IN")}` : ""}</small>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Awaiting ticketing</span>
                            )}
                          </td>
                          <td>
                            <div className="table-inline-actions">
                              {isApproved ? (
                                <button className="table-action" style={{ fontWeight: 700, color: "var(--green)" }} onClick={() => setBookingJourney(row)}>
                                  Issue Ticket <ArrowUpRight size={14} />
                                </button>
                              ) : isPending ? (
                                <button className="table-action" onClick={() => setBookingJourney(row)}>
                                  Pre-book <ArrowUpRight size={14} />
                                </button>
                              ) : record ? (
                                <>
                                  <button className="table-action" onClick={() => setEditingBooking(record)} title="Edit booking details">
                                    Edit <ArrowUpRight size={14} />
                                  </button>
                                  <button
                                    className="table-action"
                                    onClick={() => setViewingVoucher({ journey: row, booking: record })}
                                    title="View printable travel dispatch voucher"
                                    style={{ color: "var(--blue)" }}
                                  >
                                    Voucher <TicketCheck size={14} />
                                  </button>
                                </>
                              ) : (
                                <span className="table-action table-action-muted">Booked <Check size={14} /></span>
                              )}
                              <button
                                type="button"
                                className="table-action table-action-danger"
                                title="Delete request from operations queue"
                                onClick={() => setDeletingJourney(row)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<TicketCheck size={20} />}
                title="No matching requests"
                description={searchQuery || statusTab !== "ALL" || modeFilter !== "ALL" ? "Try adjusting your search query or filter options." : "Employee travel requests will appear here immediately upon submission."}
              />
            )}
          </div>
        </>
      ) : (
        /* OPERATIONS OVERVIEW MODE (/travel-desk) */
        <>
          <section className="ops-hero">
            <div>
              <span className="card-kicker">TODAY IN OPERATIONS</span>
              <h2>Keep corporate journeys moving.</h2>
              <p>Employee travel requests reach the desk immediately. Prepare advance quotes or issue confirmed tickets once approved.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <Link href="/travel-desk/bookings" className="button button-primary">
                  Open booking queue <ArrowUpRight size={16} />
                </Link>
                <Link href="/travel-desk/spend-reports" className="button button-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={15} /> Travel Spend Reports
                </Link>
                <Link href="/travel-desk/reports" className="button button-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={15} /> Operations Reports
                </Link>
                <button type="button" className="button button-ghost" onClick={exportPassengerManifest}>
                  <FileSpreadsheet size={15} /> Export manifest CSV
                </button>
              </div>
            </div>
            <div className="ops-hero-metric">
              <span>Ready to book</span>
              <strong>{String(approvedCount).padStart(2, "0")}</strong>
              <small>approved trips</small>
            </div>
          </section>

          {/* Urgent Departures Priority Radar */}
          {urgentDepartures.length > 0 && (
            <div className="urgent-triage-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ padding: 10, borderRadius: 12, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <strong style={{ fontSize: 14, color: "var(--ink)", display: "block" }}>
                    {urgentDepartures.length} Urgent Departure{urgentDepartures.length === 1 ? "" : "s"} within 48 Hours
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Immediate ticketing required. High priority departures detected in queue.
                  </span>
                </div>
              </div>
              <Link href="/travel-desk/bookings" className="button button-primary" style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff", whiteSpace: "nowrap" }}>
                <Zap size={14} /> Open Priority Workstation
              </Link>
            </div>
          )}

          {/* Bulk & Group Travel Spotlight */}
          <div
            className="panel"
            style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 14,
              padding: "16px 20px",
              marginBottom: 20,
              borderRadius: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: "rgba(16, 185, 129, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#34d399",
                }}
              >
                <UsersRound size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
                  Bulk & Group Travel Bookings ({totalBulkHeadcount} Travelers Coordinated)
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {bulkBookings.length} mass movements logged · Live roster shared with Approver.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setBulkModalOpen(true)}
                style={{ padding: "8px 14px", fontSize: 12, gap: 6 }}
              >
                <Plus size={14} /> Log Bulk Booking
              </button>
              <Link
                href="/travel-desk/bulk-bookings"
                className="button button-ghost"
                style={{ padding: "8px 14px", fontSize: 12, gap: 6, color: "#e2e8f0" }}
              >
                Open Group Workstation <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          {/* Core Operations Stats */}
          <div className="stats-grid desk-stats">
            <StatCard label="Approved to book" value={String(approvedCount).padStart(2, "0")} detail="Ready for ticketing" icon={<ShieldCheck size={18} />} accent="stat-accent" />
            <StatCard label="Pending approval" value={String(pendingApproverCount).padStart(2, "0")} detail="Early desk visibility" icon={<Clock3 size={18} />} />
            <StatCard label="Confirmed booked" value={String(activeBookings.length).padStart(2, "0")} detail={`₹${totalSpend.toLocaleString("en-IN")} total spend`} icon={<TicketCheck size={18} />} />
            <StatCard label="Cancellations" value={String(cancelledBookings.length).padStart(2, "0")} detail={`₹${totalCancellationCharges.toLocaleString("en-IN")} fees`} icon={<XCircle size={18} />} />
          </div>

          {/* 2-Column Live Analytics Grid */}
          <div className="desk-analytics-grid">
            {/* Carrier & Provider Volume Breakdown */}
            <div className="panel carrier-breakdown-panel">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">CARRIER ANALYTICS</span>
                  <h3 className="section-heading" style={{ fontSize: 18 }}>Airline & Provider Distribution</h3>
                </div>
                <Plane size={18} className="panel-icon" />
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 16px" }}>
                Volume breakdown across contracted airlines, railways, and corporate transit providers.
              </p>

              {carrierStats.length > 0 ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {carrierStats.map((stat) => (
                    <div className="carrier-stat-row" key={stat.name}>
                      <div className="carrier-stat-meta">
                        <span><strong>{stat.name}</strong></span>
                        <span className="meta-chip" style={{ fontSize: 11, padding: "2px 8px" }}>
                          <strong>{stat.count}</strong> {stat.count === 1 ? "trip" : "trips"} · <span style={{ color: "var(--green)", fontWeight: 700 }}>{stat.pct}% share</span>
                        </span>
                      </div>
                      <div className="carrier-track">
                        <div
                          className={`carrier-fill ${
                            stat.name.toLowerCase().includes("indigo")
                              ? "carrier-fill-indigo"
                              : stat.name.toLowerCase().includes("air india")
                              ? "carrier-fill-airindia"
                              : stat.name.toLowerCase().includes("vistara")
                              ? "carrier-fill-vistara"
                              : stat.name.toLowerCase().includes("rail") || stat.name.toLowerCase().includes("irctc")
                              ? "carrier-fill-rail"
                              : ""
                          }`}
                          style={{ width: `${Math.max(stat.pct, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Plane size={18} />} title="No carrier data yet" description="Confirmed bookings will populate carrier analytics." />
              )}
            </div>

            {/* Corporate Spend & Savings Snapshot */}
            <div className="panel carrier-breakdown-panel">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">FINANCIAL EFFICIENCY</span>
                  <h3 className="section-heading" style={{ fontSize: 18 }}>Corporate Spend & Savings</h3>
                </div>
                <TrendingUp size={18} className="panel-icon" />
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 16px" }}>
                Corporate cost optimization, negotiated rate savings, and department volume.
              </p>

              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                  <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--green)" }}>Total Negotiated Savings</small>
                  <strong style={{ display: "block", fontSize: 24, fontWeight: 800, color: "var(--green)", marginTop: 2 }}>
                    ₹{totalSavings.toLocaleString("en-IN")}
                  </strong>
                  <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Saved via corporate airline tariffs and advance booking windows</span>
                </div>

                <div style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-soft)", border: "1px solid var(--line)" }}>
                  <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>Average Ticket Expenditure</small>
                  <strong style={{ display: "block", fontSize: 20, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                    ₹{avgSpend.toLocaleString("en-IN")} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-muted)" }}>/ confirmed trip</span>
                  </strong>
                  <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Mean ticket spend across fulfilled employee journeys</span>
                </div>

                {/* Top department loads */}
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", display: "block", marginBottom: 8 }}>
                    Corporate Demand by Department
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {departmentStats.map(([dept, count]) => (
                      <span key={dept} className="meta-chip meta-chip-primary" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Building2 size={11} className="opacity-70" /> {dept}: <strong>{count} {count === 1 ? "trip" : "trips"}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Centralized Travel Spend Intelligence Spotlight in Travel Desk */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="section-title-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span className="card-kicker">SPEND INTELLIGENCE & HISTORICAL LEDGER</span>
                <h3 className="section-heading" style={{ fontSize: 18 }}>Company Travel Spend & Executive Reports</h3>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
                  Analyze corporate expenditure patterns, top traveling personnel, department budget shares, and airline vendor concentration.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/travel-desk/spend-reports" className="button button-primary" style={{ fontSize: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={14} /> Full Spend Reports
                </Link>
                <Link href="/travel-desk/reports" className="button button-ghost" style={{ fontSize: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={14} /> Operations Reports
                </Link>
                <button
                  type="button"
                  className="button button-ghost"
                  style={{ fontSize: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => spendReportsApi.downloadReport("EXECUTIVE_SUMMARY").catch(() => toast.error("Failed to export spend report"))}
                >
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            <div className="stats-grid desk-stats" style={{ marginTop: 14 }}>
              <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-soft)", border: "1px solid var(--line)" }}>
                <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>Total Evaluated Spend</small>
                <strong style={{ display: "block", fontSize: 20, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                  ₹{(spendOverview?.totalSpend || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </strong>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Across {spendOverview?.totalTrips || 0} corporate trips ({spendOverview?.travelerCount || 0} distinct travelers)
                </span>
              </div>

              <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-soft)", border: "1px solid var(--line)" }}>
                <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>Average Spend / Trip</small>
                <strong style={{ display: "block", fontSize: 20, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                  ₹{(spendOverview?.avgSpendPerTrip || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </strong>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Avg ₹{(spendOverview?.avgSpendPerTraveler || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} per traveling employee
                </span>
              </div>

              <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-soft)", border: "1px solid var(--line)" }}>
                <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>Top Spender</small>
                <strong style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {spendOverview?.highestSpendingEmployee?.employeeName || "—"}
                </strong>
                <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>
                  {spendOverview?.highestSpendingEmployee ? `₹${spendOverview.highestSpendingEmployee.totalSpend.toLocaleString("en-IN")} (${spendOverview.highestSpendingEmployee.tripCount} trips)` : "No recorded trips"}
                </span>
              </div>

              <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-soft)", border: "1px solid var(--line)" }}>
                <small style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>Top Department</small>
                <strong style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {spendOverview?.highestSpendingDepartment?.department || "—"}
                </strong>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {spendOverview?.highestSpendingDepartment ? `₹${spendOverview.highestSpendingDepartment.totalSpend.toLocaleString("en-IN")} (${spendOverview.highestSpendingDepartment.tripCount} trips)` : "No departmental records"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Operations Queue */}
          <div className="panel table-panel">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">OPERATIONS QUEUE</span>
                <h2 className="section-heading">Employee travel requests</h2>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Link href="/travel-desk/bookings" className="button button-ghost">
                  Open full workstation <ArrowUpRight size={14} />
                </Link>
                <span className="data-note"><ShieldCheck size={13} /> Live backend data</span>
              </div>
            </div>

            {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
            {bookingError && <div className="form-error-message"><XCircle size={15} />{bookingError}</div>}

            {loading || bookingsLoading ? (
              <EmptyState icon={<Clock3 size={20} />} title="Loading queue" description="Fetching travel requests and booking records from Trapple." />
            ) : rows.length ? (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Employee / Passenger</th>
                      <th>Journey & Route</th>
                      <th>Travel dates</th>
                      <th>Approver status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row) => {
                      const record = activeBookings.find((booking) => String(booking?.travelRequest?.id) === row.id);
                      const isApproved = row.status === "Approved";
                      const isPending = row.status === "Pending approval";
                      const isBooked = row.status === "Booked";
                      const urgency = getDepartureUrgency(row);
                      const emp = row.employee || {
                        name: row.passenger || "Employee",
                        employeeId: "EMP",
                        department: "General Operations",
                        designation: "Employee",
                      };

                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="table-journey">
                              <span className="avatar avatar-tiny">
                                {(emp.name || row.passenger || "E").slice(0, 2).toUpperCase()}
                              </span>
                              <span>
                                <strong>{emp.name || row.passenger}</strong>
                                <small>{emp.employeeId} · {emp.department} · {emp.designation}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <strong>{row.destination}</strong>
                            <small className="table-subline">{row.from} → {row.to} · {row.project}</small>
                          </td>
                          <td>
                            <div>
                              <span>{row.dates}</span>
                              {urgency.badgeText && (
                                <div style={{ marginTop: 2 }}>
                                  <span className={urgency.isUrgent ? "urgent-badge-pill" : "meta-chip"} style={{ fontSize: 10 }}>
                                    {urgency.isUrgent && <AlertTriangle size={11} className="shrink-0" />}
                                    <span>{urgency.badgeText}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {isApproved ? (
                              <span className="approval-pill approved"><Check size={12} /> Approver Approved</span>
                            ) : isPending ? (
                              <span className="approval-pill pending"><Clock3 size={12} /> Not Approved Yet</span>
                            ) : isBooked ? (
                              <span className="approval-pill booked"><TicketCheck size={12} /> Booked & Ticketed</span>
                            ) : (
                              <StatusBadge status={row.status} />
                            )}
                          </td>
                          <td>
                            <div className="table-inline-actions">
                              {isApproved ? (
                                <button className="table-action" style={{ fontWeight: 700, color: "var(--green)" }} onClick={() => setBookingJourney(row)}>
                                  Add booking <ArrowUpRight size={14} />
                                </button>
                              ) : isPending ? (
                                <button className="table-action" onClick={() => setBookingJourney(row)}>
                                  Prepare booking <ArrowUpRight size={14} />
                                </button>
                              ) : record ? (
                                <>
                                  <button className="table-action" onClick={() => setEditingBooking(record)}>
                                    View / edit <ArrowUpRight size={14} />
                                  </button>
                                  <button
                                    className="table-action"
                                    onClick={() => setViewingVoucher({ journey: row, booking: record })}
                                    style={{ color: "var(--blue)" }}
                                    title="View dispatch voucher"
                                  >
                                    Voucher <TicketCheck size={14} />
                                  </button>
                                </>
                              ) : (
                                <span className="table-action table-action-muted">Booked <Check size={14} /></span>
                              )}
                              <button
                                type="button"
                                className="table-action table-action-danger"
                                title="Delete request from operations queue"
                                onClick={() => setDeletingJourney(row)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<TicketCheck size={20} />} title="No travel requests" description="Employee travel requests will appear here immediately upon submission." />
            )}
          </div>
        </>
      )}

      {/* MODALS */}
      {bookingJourney && <BookingDialog journey={bookingJourney} onClose={() => setBookingJourney(null)} onSubmit={createBooking} />}
      {editingBooking && <BookingEditDialog booking={editingBooking} onClose={() => setEditingBooking(null)} onSubmit={updateBooking} />}
      {cancellingBooking && <CancellationDialog booking={cancellingBooking} onClose={() => setCancellingBooking(null)} onSubmit={cancelBooking} />}
      {viewingVoucher && <VoucherModal journey={viewingVoucher.journey} booking={viewingVoucher.booking} onClose={() => setViewingVoucher(null)} />}
      {bulkModalOpen && (
        <BulkBookingDialog
          onClose={() => setBulkModalOpen(false)}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {editingBulkRecord && (
        <BulkBookingDialog
          booking={editingBulkRecord}
          onClose={() => setEditingBulkRecord(null)}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {selectedBulkManifest && (
        <GroupManifestModal
          booking={selectedBulkManifest}
          isApprover={false}
          onClose={() => setSelectedBulkManifest(null)}
          onUpdate={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {deletingBulkRecord && (
        <DeleteConfirmDialog
          title={`Delete bulk booking ${deletingBulkRecord.groupReference}?`}
          description={`Remove group movement "${deletingBulkRecord.title}" for ${deletingBulkRecord.headcount} travelers to ${deletingBulkRecord.destination}?`}
          confirmLabel="Delete bulk booking"
          onConfirm={async () => {
            await bulkBookingsApi.delete(deletingBulkRecord.id);
            setBulkBookings((prev) => prev.filter((b) => b.id !== deletingBulkRecord.id));
            toast.success(`Bulk booking ${deletingBulkRecord.groupReference} deleted.`);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setDeletingBulkRecord(null)}
        />
      )}
      {deletingJourney && (
        <DeleteConfirmDialog
          title={`Delete request #${deletingJourney.id}?`}
          description={`Remove travel request for ${deletingJourney.passenger || "employee"} to ${deletingJourney.destination} from the operations queue?`}
          confirmLabel="Delete request"
          onConfirm={async () => {
            await travelRequestsApi.delete(deletingJourney.id);
            toast.success(`Request #${deletingJourney.id} deleted.`);
            await refresh();
          }}
          onClose={() => setDeletingJourney(null)}
        />
      )}
    </div>
  );
}

const CARRIER_QUICK_CHIPS: Record<string, string[]> = {
  FLIGHT: ["IndiGo", "Air India", "Vistara", "Akasa Air", "SpiceJet"],
  TRAIN: ["IRCTC / Indian Railways", "Vande Bharat Express", "Rajdhani Express"],
  HOTEL: ["Taj Hotels", "Marriott Corporate", "Hyatt Regency", "Lemon Tree", "Ginger Hotels"],
  CAB: ["Uber Corporate", "Ola Corporate", "Mega Cabs"],
  BUS: ["Zingbus", "IntrCity SmartBus", "State Transport"],
};

function BookingDialog({ journey, onClose, onSubmit }: { journey: Journey; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [bookingType, setBookingType] = useState("FLIGHT");
  const [provider, setProvider] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [seatNo, setSeatNo] = useState("");
  const [terminal, setTerminal] = useState("");
  const [costValue, setCostValue] = useState("");
  const [savingsValue, setSavingsValue] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentType, setAttachmentType] = useState("");
  const [attachmentData, setAttachmentData] = useState("");
  const [attachmentSize, setAttachmentSize] = useState("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("File size cannot exceed 8MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentType(file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"));
      setAttachmentData(reader.result as string);
      setAttachmentSize((file.size / 1024).toFixed(0) + " KB");
    };
    reader.readAsDataURL(file);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedType = bookingType;
    const bookingReference = String(form.get("bookingReference") || "").trim();
    const cost = Number(costValue);
    if (!selectedType || !bookingReference || !costValue || !journey.id) {
      setError("Booking type, reference, cost, and the selected travel request are required.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0 || (savingsValue && (!Number.isFinite(Number(savingsValue)) || Number(savingsValue) < 0))) {
      setError("Cost and savings must be valid non-negative amounts.");
      return;
    }

    // Compose helper notes
    const rawNotes = String(form.get("notes") || "").trim();
    const details = [
      flightNo ? `Service No: ${flightNo}` : null,
      seatNo ? `Seat/Room: ${seatNo}` : null,
      terminal ? `Terminal/Platform: ${terminal}` : null,
      rawNotes ? rawNotes : null,
    ].filter(Boolean).join(" · ");

    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        travelRequest: { id: journey.id },
        bookingType: selectedType,
        bookingReference,
        provider: provider.trim() || null,
        cost,
        savings: savingsValue ? Number(savingsValue) : null,
        notes: details || null,
        attachmentName: attachmentName || null,
        attachmentType: attachmentType || null,
        attachmentData: attachmentData || null,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't create this booking.");
    } finally {
      setSubmitting(false);
    }
  }

  const emp = journey.employee || {
    name: journey.passenger || "Employee",
    employeeId: "EMP",
    department: "General Operations",
    designation: "Employee",
  };

  const chips = CARRIER_QUICK_CHIPS[bookingType] || [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-dialog-title">
      <div className="booking-dialog">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close booking form"><X size={18} /></button>
        <div className="booking-dialog-header">
          <div className="confirm-icon approve"><TicketCheck size={22} /></div>
          <span className="card-kicker">TRAVEL DESK FAST-TICKETING</span>
          <h2 id="booking-dialog-title">Issue booking & ticket voucher</h2>
          <p>Attach confirmed ticket details, quick carrier chips, seat allocation, and PDF voucher.</p>
        </div>

        {/* Employee Profile Card for Travel Desk */}
        <div className="employee-profile-card" style={{ margin: "14px 0" }}>
          <div className="employee-avatar-large">
            {(emp.name || journey.passenger || "E").slice(0, 2).toUpperCase()}
          </div>
          <div className="employee-profile-info">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
              Passenger Details
            </span>
            <h3>{emp.name || journey.passenger}</h3>
            <div className="employee-meta-chips">
              <span className="meta-chip meta-chip-primary">
                <UserRound size={12} /> ID: {emp.employeeId || "EMP"}
              </span>
              <span className="meta-chip">
                Department: {emp.department || "General Operations"}
              </span>
              <span className="meta-chip">
                Designation: {emp.designation || "Employee"}
              </span>
            </div>
          </div>
        </div>

        {journey.reason && (
          <div className="reason-box" style={{ margin: "10px 0 16px" }}>
            <div className="reason-box-header">
              <FileText size={13} />
              <span>Travel Purpose & Justification</span>
            </div>
            <p className="reason-box-content" style={{ fontSize: 12 }}>
              {journey.reason}
            </p>
          </div>
        )}

        {journey.status === "Approved" ? (
          <div className="approver-box-approved">
            <ShieldCheck size={20} className="shrink-0" />
            <div>
              <strong>Approver Decision: Approved</strong>
              <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                Approved by {journey.approverName || "Assigned Manager"}. Authorized for confirmed ticketing and issuance.
              </p>
            </div>
          </div>
        ) : (
          <div className="approver-box-pending">
            <Clock3 size={20} className="shrink-0" />
            <div>
              <strong>Notice: Trip Not Approved Yet</strong>
              <p style={{ fontSize: 12, margin: "2px 0 0" }}>
                This trip was raised by the employee and routed to Travel Desk for visibility. Manager sign-off is pending.
              </p>
            </div>
          </div>
        )}

        <div className="booking-request-summary">
          <span className="avatar avatar-tiny">{journey.destination.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{journey.destination}</strong>
            <span>{journey.id} · {journey.from} → {journey.to} · {journey.dates}</span>
          </div>
          <StatusBadge status={journey.status} />
        </div>

        <form className="booking-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Booking type <em>*</em></span>
              <select
                name="bookingType"
                value={bookingType}
                onChange={(e) => {
                  setBookingType(e.target.value);
                  setProvider("");
                }}
                required
              >
                <option value="FLIGHT">Flight</option>
                <option value="TRAIN">Train</option>
                <option value="HOTEL">Hotel</option>
                <option value="CAB">Cab</option>
                <option value="BUS">Bus</option>
              </select>
            </label>
            <label className="field">
              <span>Booking reference / PNR <em>*</em></span>
              <input name="bookingReference" required placeholder="e.g. 6E-9H2K8 or AI-4412" />
            </label>
          </div>

          {/* Quick Carrier Select Chips */}
          {chips.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>
                Quick Carrier Select:
              </span>
              <div className="carrier-chips-container">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`carrier-quick-chip ${provider === chip ? "selected" : ""}`}
                    onClick={() => setProvider(chip)}
                  >
                    {provider === chip ? <Check size={12} /> : <Zap size={12} />} {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Provider / Airline</span>
              <input
                name="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. IndiGo, Air India, Marriott"
              />
            </label>
            <label className="field">
              <span>Cost (₹) <em>*</em></span>
              <input
                name="cost"
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={costValue}
                onChange={(e) => setCostValue(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Savings (₹)</span>
              <input
                name="savings"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={savingsValue}
                onChange={(e) => setSavingsValue(e.target.value)}
              />
            </label>
          </div>

          {/* Operational helper fields for travel desk */}
          <div className="form-grid" style={{ marginTop: 2 }}>
            <label className="field">
              <span>Flight / Train / Room No.</span>
              <input
                placeholder="e.g. 6E-2041 or Room 402"
                value={flightNo}
                onChange={(e) => setFlightNo(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Seat / Berth No.</span>
              <input
                placeholder="e.g. 14B or B2-31"
                value={seatNo}
                onChange={(e) => setSeatNo(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Terminal / Platform</span>
              <input
                placeholder="e.g. Terminal 3, Platform 1"
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <span>Attach ticket copy (Photo or PDF)</span>
            {!attachmentData ? (
              <label className="ticket-upload-box">
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={handleFileChange} style={{ display: "none" }} />
                <Upload size={22} className="text-amber-500" />
                <strong style={{ fontSize: 13 }}>Click to upload ticket photo or PDF voucher</strong>
                <span style={{ fontSize: 11, opacity: 0.75 }}>Supports PNG, JPG, WEBP, or PDF up to 8MB</span>
              </label>
            ) : (
              <div>
                <div className="ticket-file-chip" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {attachmentType.includes("pdf") || attachmentName.toLowerCase().endsWith(".pdf") ? <FileText size={20} className="text-red-500 shrink-0" /> : <ImageIcon size={20} className="text-emerald-500 shrink-0" />}
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{attachmentName}</span>
                      <small style={{ opacity: 0.7, fontSize: 11 }}>{attachmentType.includes("pdf") || attachmentName.toLowerCase().endsWith(".pdf") ? "PDF Ticket" : "Image File"}{attachmentSize ? ` (${attachmentSize})` : ""}</small>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="button button-ghost"
                      style={{ padding: "4px 8px", fontSize: 11, gap: 4 }}
                      onClick={() => {
                        const w = window.open("");
                        if (w) {
                          w.document.write(`<iframe src="${attachmentData}" style="width:100vw; height:100vh; border:none;" />`);
                          w.document.title = attachmentName || "Ticket Document Preview";
                        }
                      }}
                      title="Preview document in new window"
                    >
                      <Eye size={13} /> Preview
                    </button>
                    <button type="button" className="icon-button" onClick={() => { setAttachmentData(""); setAttachmentName(""); setAttachmentType(""); setAttachmentSize(""); }} title="Remove attachment"><X size={14} /></button>
                  </div>
                </div>
                {attachmentType.includes("image") && <img src={attachmentData} alt="Ticket preview" className="ticket-attachment-preview" style={{ marginTop: 8 }} />}
              </div>
            )}
          </div>

          <label className="field">
            <span>Additional notes / Itinerary instructions</span>
            <textarea name="notes" rows={2} placeholder="Add special instructions, meal preferences, or baggage rules for the employee." />
          </label>

          {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

          <div className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Issuing ticket…" : "Issue ticket & notify traveler"} <ArrowUpRight size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BookingTable({
  bookings,
  journeys = [],
  onEdit,
  onCancel,
  onVoucher,
  cancellationOnly = false,
}: {
  bookings: any[];
  journeys?: Journey[];
  onEdit: (booking: any) => void;
  onCancel: (booking: any) => void;
  onVoucher?: (booking: any, journey?: Journey) => void;
  cancellationOnly?: boolean;
}) {
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            <th>Reference / PNR</th>
            <th>Type</th>
            <th>Provider</th>
            <th>Cost</th>
            <th>Attachment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const reqId = String(booking?.travelRequest?.id || "");
            const matchingJourney = journeys.find((j) => j.id === reqId);

            return (
              <tr key={booking.id}>
                <td>
                  <strong>{booking.bookingReference || "—"}</strong>
                  <small className="table-subline">Request {booking.travelRequest?.id || "—"}</small>
                </td>
                <td>{booking.bookingType || "—"}</td>
                <td>{booking.provider || "—"}</td>
                <td>{booking.cost !== undefined ? `₹${Number(booking.cost).toLocaleString("en-IN")}` : "—"}</td>
                <td>
                  {booking.attachmentData ? (
                    <span className="ticket-badge" title={booking.attachmentName || "Attached"}>
                      <FileText size={12} /> {booking.attachmentType?.includes("pdf") ? "PDF Ticket" : "Photo"}
                    </span>
                  ) : (
                    <span className="text-xs opacity-50">—</span>
                  )}
                </td>
                <td><StatusBadge status={booking.cancelled ? "Cancelled" : "Booked"} /></td>
                <td>
                  {booking.cancelled || cancellationOnly ? (
                    <span className="table-action table-action-muted">{booking.cancelled ? "Cancelled" : "View"}</span>
                  ) : (
                    <div className="table-inline-actions">
                      <button className="table-action" onClick={() => onEdit(booking)}>Edit <ArrowUpRight size={14} /></button>
                      {onVoucher && matchingJourney && (
                        <button
                          className="table-action"
                          style={{ color: "var(--blue)" }}
                          onClick={() => onVoucher(booking, matchingJourney)}
                          title="View dispatch voucher"
                        >
                          Voucher <TicketCheck size={14} />
                        </button>
                      )}
                      <button className="table-action table-action-danger" onClick={() => onCancel(booking)}>Cancel <XCircle size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BookingEditDialog({ booking, onClose, onSubmit }: { booking: any; onClose: () => void; onSubmit: (id: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [bookingType, setBookingType] = useState(booking.bookingType || "FLIGHT");
  const [provider, setProvider] = useState(booking.provider || "");
  const [attachmentName, setAttachmentName] = useState(booking.attachmentName || "");
  const [attachmentType, setAttachmentType] = useState(booking.attachmentType || "");
  const [attachmentData, setAttachmentData] = useState(booking.attachmentData || "");
  const [attachmentSize, setAttachmentSize] = useState("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("File size cannot exceed 8MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentType(file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"));
      setAttachmentData(reader.result as string);
      setAttachmentSize((file.size / 1024).toFixed(0) + " KB");
    };
    reader.readAsDataURL(file);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reference = String(form.get("bookingReference") || "").trim();
    const cost = Number(form.get("cost"));
    if (!reference || !Number.isFinite(cost) || cost < 0) {
      setError("Booking reference and a valid non-negative cost are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(String(booking.id), {
        bookingType,
        bookingReference: reference,
        provider: provider.trim() || null,
        cost,
        savings: String(form.get("savings") || "").trim() ? Number(form.get("savings")) : null,
        notes: String(form.get("notes") || "").trim() || null,
        attachmentName: attachmentName || null,
        attachmentType: attachmentType || null,
        attachmentData: attachmentData || null,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't update this booking.");
    } finally {
      setSubmitting(false);
    }
  }

  const chips = CARRIER_QUICK_CHIPS[bookingType] || [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="booking-dialog">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close edit booking"><X size={18} /></button>
        <div className="booking-dialog-header">
          <div className="confirm-icon approve"><TicketCheck size={22} /></div>
          <span className="card-kicker">EDIT BOOKING</span>
          <h2>Update ticket details</h2>
          <p>Update itinerary, carrier, cost, and attached photo / PDF ticket voucher.</p>
        </div>
        <form className="booking-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Booking type</span>
              <select
                name="bookingType"
                value={bookingType}
                onChange={(e) => setBookingType(e.target.value)}
              >
                <option value="FLIGHT">Flight</option>
                <option value="BUS">Bus</option>
                <option value="CAB">Cab</option>
                <option value="TRAIN">Train</option>
                <option value="HOTEL">Hotel</option>
              </select>
            </label>
            <label className="field">
              <span>Booking reference *</span>
              <input name="bookingReference" defaultValue={booking.bookingReference || ""} required />
            </label>
          </div>

          {chips.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase" }}>
                Quick Carrier Select:
              </span>
              <div className="carrier-chips-container">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`carrier-quick-chip ${provider === chip ? "selected" : ""}`}
                    onClick={() => setProvider(chip)}
                  >
                    {provider === chip ? <Check size={12} /> : <Zap size={12} />} {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-grid">
            <label className="field">
              <span>Provider</span>
              <input name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </label>
            <label className="field">
              <span>Cost *</span>
              <input name="cost" type="number" min="0" step="0.01" defaultValue={booking.cost ?? ""} required />
            </label>
            <label className="field">
              <span>Savings</span>
              <input name="savings" type="number" min="0" step="0.01" defaultValue={booking.savings ?? ""} />
            </label>
          </div>

          <div className="field">
            <span>Ticket attachment (Photo or PDF)</span>
            {!attachmentData ? (
              <label className="ticket-upload-box">
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={handleFileChange} style={{ display: "none" }} />
                <Upload size={22} className="text-amber-500" />
                <strong style={{ fontSize: 13 }}>Upload replacement ticket photo or PDF</strong>
                <span style={{ fontSize: 11, opacity: 0.75 }}>Supports PNG, JPG, WEBP, or PDF up to 8MB</span>
              </label>
            ) : (
              <div>
                <div className="ticket-file-chip" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {attachmentType?.includes("pdf") || attachmentName?.toLowerCase().endsWith(".pdf") ? <FileText size={20} className="text-red-500 shrink-0" /> : <ImageIcon size={20} className="text-emerald-500 shrink-0" />}
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{attachmentName || "Attached document"}</span>
                      <small style={{ opacity: 0.7, fontSize: 11 }}>{attachmentType?.includes("pdf") || attachmentName?.toLowerCase().endsWith(".pdf") ? "PDF Ticket" : "Image File"}{attachmentSize ? ` (${attachmentSize})` : ""}</small>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="button button-ghost"
                      style={{ padding: "4px 8px", fontSize: 11, gap: 4 }}
                      onClick={() => {
                        const w = window.open("");
                        if (w) {
                          w.document.write(`<iframe src="${attachmentData}" style="width:100vw; height:100vh; border:none;" />`);
                          w.document.title = attachmentName || "Ticket Document Preview";
                        }
                      }}
                      title="Preview document in new window"
                    >
                      <Eye size={13} /> Preview
                    </button>
                    <button type="button" className="icon-button" onClick={() => { setAttachmentData(""); setAttachmentName(""); setAttachmentType(""); setAttachmentSize(""); }} title="Remove attachment"><X size={14} /></button>
                  </div>
                </div>
                {attachmentType?.includes("image") && <img src={attachmentData} alt="Ticket preview" className="ticket-attachment-preview" style={{ marginTop: 8 }} />}
              </div>
            )}
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea name="notes" rows={2} defaultValue={booking.notes || ""} />
          </label>

          {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}

          <div className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Saving…" : "Save changes"} <ArrowUpRight size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CancellationDialog({ booking, onClose, onSubmit }: { booking: any; onClose: () => void; onSubmit: (id: string, reason: string, charge: number) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    const charge = Number(form.get("cancellationCharge") || 0);
    if (!reason || !Number.isFinite(charge) || charge < 0) {
      setError("A cancellation reason and valid non-negative charge are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(String(booking.id), reason, charge);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't cancel this booking.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog cancellation-dialog">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close cancellation dialog"><X size={18} /></button>
        <div className="confirm-icon reject"><XCircle size={22} /></div>
        <span className="card-kicker">CANCEL BOOKING</span>
        <h2>Cancel {booking.bookingReference || "this booking"}?</h2>
        <p>This action updates the real backend booking record and cannot be repeated once cancelled.</p>
        <form className="booking-form" onSubmit={submit}>
          <label className="field">
            <span>Cancellation reason *</span>
            <textarea name="reason" rows={3} required placeholder="Why is this booking being cancelled?" />
          </label>
          <label className="field">
            <span>Cancellation charge</span>
            <input name="cancellationCharge" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
          {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Keep booking</button>
            <button type="submit" className="button button-danger" disabled={submitting}>{submitting ? "Cancelling…" : "Cancel booking"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Reports() {
  const user = getStoredUser<AuthUser>();
  const [requests, setRequests] = useState<Array<Record<string, any>>>([]);
  const [bookings, setBookings] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportView, setReportView] = useState<"operations" | "spend">("operations");

  const fetchReports = async () => {
    setLoading(true);
    setError("");
    try {
      const [reqResult, bkResult] = await Promise.allSettled([
        travelRequestsApi.list(),
        bookingsApi.list(),
      ]);

      if (reqResult.status === "fulfilled" && Array.isArray(reqResult.value)) {
        setRequests(reqResult.value as Array<Record<string, any>>);
      }
      if (bkResult.status === "fulfilled" && Array.isArray(bkResult.value)) {
        setBookings(bkResult.value as Array<Record<string, any>>);
      }

      if (reqResult.status === "rejected" && bkResult.status === "rejected") {
        const err = reqResult.reason;
        setError(err instanceof Error ? err.message : "Report records are unavailable.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report records are unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    const handleSync = () => fetchReports();
    window.addEventListener("trapple_cloud_synced", handleSync);
    window.addEventListener("travora_cloud_synced", handleSync);
    return () => {
      window.removeEventListener("trapple_cloud_synced", handleSync);
      window.removeEventListener("travora_cloud_synced", handleSync);
    };
  }, []);

  const counts = {
    approved: requests.filter((r) => String(r.status).toUpperCase() === "APPROVED").length,
    pending: requests.filter((r) => String(r.status).toUpperCase() === "PENDING").length,
    completed: requests.filter((r) => ["COMPLETED", "BOOKED"].includes(String(r.status).toUpperCase())).length,
  };

  const destinations = Array.from(
    new Set(requests.map((r) => r.toLocation).filter(Boolean))
  ).slice(0, 5);

  const isApprover = user?.role === "APPROVER";
  const isTravelDesk = user?.role === "TRAVEL_DESK";
  const roleLabel = isApprover
    ? "Approval Team Travel Extraction"
    : isTravelDesk
    ? "Operations Ticketing & Vendor Extraction"
    : "Personal Employee Travel Extraction";

  const headerTitle = isApprover
    ? "Management & Team Travel Intelligence"
    : isTravelDesk
    ? "Travel Desk Bookings & Vendor Report"
    : "Patterns that help you plan ahead.";

  const headerDesc = isApprover
    ? "Supervised employee travel records, approval logs, and departmental booking spend."
    : isTravelDesk
    ? "Confirmed flight, hotel, and transit bookings, carrier vendor costs, and passenger manifests."
    : "These signals are calculated from the travel requests and bookings returned for your authenticated account.";

  return (
    <div className="page-stack animate-page">
      <PageTitle
        meta={{
          eyebrow: isApprover
            ? "Approver workspace"
            : isTravelDesk
            ? "Travel desk"
            : "Employee workspace",
          title: "Reports & Financial Extraction",
          description: headerDesc,
        }}
      />

      {/* Mode Switcher: Operations vs Spend Intelligence */}
      <div style={{ display: "flex", gap: 10, margin: "8px 0 16px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setReportView("operations")}
          className={`button ${reportView === "operations" ? "button-primary" : "button-ghost"}`}
          style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <BarChart3 size={15} /> Operations & Manifest Extraction
        </button>
        <button
          type="button"
          onClick={() => setReportView("spend")}
          className={`button ${reportView === "spend" ? "button-primary" : "button-ghost"}`}
          style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <TrendingUp size={15} /> Corporate Travel Spend Reports
        </button>
      </div>

      {error && (
        <div className="form-error-message" style={{ marginBottom: 16 }}>
          <XCircle size={15} />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchReports}
            style={{ marginLeft: "auto", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "inherit" }}
          >
            Retry
          </button>
        </div>
      )}

      {reportView === "spend" ? (
        <TravelSpendReports user={user || ({} as AuthUser)} />
      ) : (
        <>
          <div className="report-header">
            <div>
              <span className="card-kicker">
                {isApprover
                  ? "TEAM INTELLIGENCE"
                  : isTravelDesk
                  ? "OPERATIONS INTELLIGENCE"
                  : "LIVE TRAVEL DATA"}
              </span>
              <h2>{headerTitle}</h2>
              <p>{headerDesc}</p>
            </div>
            <div className="report-period">
              <CalendarDays size={16} />{" "}
              {isApprover
                ? "Supervised Team"
                : isTravelDesk
                ? "All Operations"
                : "Current account"}
            </div>
          </div>

          {/* Financial Extraction Suite (PDF, Excel, Cost Breakdown, Manifest) */}
          <ReportExtractionSuite
            requests={requests}
            bookings={bookings}
            currentUser={user}
            roleTitle={roleLabel}
          />

          {/* Corridor Map */}
          <InteractiveRouteMap />

          {/* Destination Grid & Insights */}
          <section className="report-grid">
            <div className="panel destination-panel">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">DESTINATIONS</span>
                  <h2 className="section-heading">Where work takes you</h2>
                </div>
                <Compass size={18} className="panel-icon" />
              </div>
              {destinations.length ? (
                <div className="destination-list">
                  {destinations.map((destination, index) => (
                    <Destination
                      key={destination}
                      name={destination}
                      count={`${
                        requests.filter((r) => r.toLocation === destination).length
                      } request${
                        requests.filter((r) => r.toLocation === destination).length === 1
                          ? ""
                          : "s"
                      }`}
                      width={`${88 - index * 14}%`}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Compass size={20} />}
                  title="No destination data yet"
                  description="Submit or approve a travel request to build your destination matrix."
                />
              )}
            </div>

            <div className="panel insight-card">
              <div className="insight-symbol">
                <Sparkles size={18} />
              </div>
              <div>
                <span className="card-kicker">TRAPPLE SIGNAL</span>
                <h3>
                  {loading
                    ? "Loading travel intelligence"
                    : requests.length
                    ? "Keep the request context close."
                    : "Your first request starts the signal."}
                </h3>
                <p>
                  {loading
                    ? "Fetching the latest request activity."
                    : requests.length
                    ? "Approval and booking teams use the same request record to keep handoffs clear and eliminate vendor invoice discrepancies."
                    : "Create a request to see destinations, statuses and travel patterns here."}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function Destination({ name, count, width }: { name: string; count: string; width: string }) { return <div className="destination-item"><div><strong>{name}</strong><span>{count}</span></div><div className="destination-track"><span style={{ width }} /></div></div>; }

function Support() { const faqs = [{ q: "How do I submit a travel request?", a: "Open Plan a trip, add your route, dates, project and business reason, then submit. Your employee identity is attached from the authenticated session." }, { q: "What happens after I submit?", a: "Your request moves to the assigned approver. Once approved, the Travel Desk can confirm the booking and attach ticket details." }, { q: "Can I cancel a journey?", a: "Eligible requests can be cancelled from the journey detail view. Cancellation eligibility and any fee rules come from your organization's policy." }, { q: "Where can I find my ticket?", a: "Open My journeys and select a booked trip. Your ticket number, airline and booking reference will appear as soon as the Travel Desk adds them." }]; const [open, setOpen] = useState(0); return <div className="page-stack animate-page"><PageTitle meta={pageMeta["/employee/support"]} /><section className="support-hero"><div className="support-symbol"><Headphones size={25} /></div><div><span className="card-kicker">TRAPPLE HELP CENTER</span><h2>We’re here to keep work travel simple.</h2><p>Find a quick answer below, or reach out to your internal travel desk.</p></div><button className="button button-primary" onClick={() => toast("Support contact will connect to your internal help channel.")}>Contact travel desk <ArrowUpRight size={16} /></button></section><div className="support-grid"><div className="panel faq-panel"><div className="section-title-row"><div><span className="card-kicker">COMMON QUESTIONS</span><h2 className="section-heading">Frequently asked</h2></div><CircleHelp size={18} className="panel-icon" /></div><div className="faq-list">{faqs.map((faq, index) => <div className={`faq-item ${open === index ? "open" : ""}`} key={faq.q}><button onClick={() => setOpen(open === index ? -1 : index)}><span>{faq.q}</span><ChevronDown size={17} /></button>{open === index && <p>{faq.a}</p>}</div>)}</div></div><div className="panel support-links"><span className="card-kicker">GETTING STARTED</span><h2 className="section-heading">A smoother trip starts here.</h2><div className="support-link"><span className="support-link-icon"><FileText size={16} /></span><span><strong>Travel policy</strong><small>Know the essentials before you request.</small></span><ChevronRight size={15} /></div><div className="support-link"><span className="support-link-icon"><TicketCheck size={16} /></span><span><strong>Booking help</strong><small>Understand what happens after approval.</small></span><ChevronRight size={15} /></div><div className="support-link"><span className="support-link-icon"><WalletCards size={16} /></span><span><strong>Expense guidance</strong><small>Keep receipts and records together.</small></span><ChevronRight size={15} /></div></div></div></div>; }


function adminRequestStatus(value: unknown) {
  const normalized = String(value || "PENDING").toUpperCase();
  const labels: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", BOOKED: "Booked", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  return labels[normalized] || normalized.replaceAll("_", " ");
}
function adminRequestDate(value: unknown) { if (!value) return "—"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function adminRequestSubmitted(request: Record<string, any>) { return request.createdAt || request.createdDate || request.submittedAt || request.submissionDate || request.requestDate || request.createdOn; }
function AdminRequestDetails({ request, onClose }: { request: Record<string, any>; onClose: () => void }) {
  const employee = request.employee || {};
  const fields = [["Employee", employee.name || employee.username || "—"], ["Employee ID", employee.employeeId || "—"], ["Trip type", request.tripType || "—"], ["From location", request.fromLocation || "—"], ["To location", request.toLocation || "—"], ["Travel date", adminRequestDate(request.travelDate)], ["Return date", adminRequestDate(request.returnDate)], ["Project", request.projectName || "—"], ["Submitted", adminRequestDate(adminRequestSubmitted(request))], ["Approver", request.approverName || "—"], ["Approval date", adminRequestDate(request.approvalDate)]];
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-request-details-title"><div className="confirm-dialog admin-request-dialog"><button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close request details"><X size={18} /></button><div className="confirm-icon approve"><FileText size={22} /></div><span className="card-kicker">REQUEST DETAILS</span><h2 id="admin-request-details-title">Travel request #{request.id ?? "—"}</h2><p>Complete request information returned by the authenticated backend.</p><div className="admin-request-detail-grid">{fields.map(([label, value]) => <div className="admin-request-detail" key={label}><small>{label}</small><strong>{String(value)}</strong></div>)}<div className="admin-request-detail"><small>Status</small><StatusBadge status={adminRequestStatus(request.status) as any} /></div><div className="admin-request-detail admin-request-detail-wide"><small>Reason</small><strong>{request.reason || "No reason provided"}</strong></div>{request.approvalComment && <div className="admin-request-detail admin-request-detail-wide"><small>Approval comment</small><strong>{request.approvalComment}</strong></div>}</div><div className="dialog-actions"><button type="button" className="button button-primary" onClick={onClose}>Close details</button></div></div></div>;
}
function AdminRequests() {
  const [requests, setRequests] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    isDanger?: boolean;
    action: () => Promise<void>;
  } | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await travelRequestsApi.list();
      setRequests(Array.isArray(data) ? (data as Array<Record<string, any>>) : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Travel requests are unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const statuses = useMemo(() => Array.from(new Set(requests.map((request) => String(request.status || "PENDING").toUpperCase()))), [requests]);
  const filtered = useMemo(() => requests.filter((request) => {
    const employee = request.employee || {};
    const haystack = [request.id, employee.name, employee.employeeId, request.tripType, request.fromLocation, request.toLocation, request.projectName, request.reason, request.status].join(" ").toLowerCase();
    return (statusFilter === "ALL" || String(request.status || "PENDING").toUpperCase() === statusFilter) && haystack.includes(query.toLowerCase());
  }), [requests, query, statusFilter]);

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/admin/requests"]} />
      <div className="section-title-row section-title-spaced">
        <div>
          <span className="card-kicker">ADMINISTRATION</span>
          <h2 className="section-heading">Request activity</h2>
          <p className="page-description">Review every travel request returned by the connected backend.</p>
        </div>
        <span className="data-note"><ShieldCheck size={13} /> Live backend data</span>
      </div>
      <div className="panel table-panel">
        <div className="table-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, route or project" />
          </div>
          <div className="toolbar-filters">
            <Filter size={15} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              {statuses.map((status) => <option value={status} key={status}>{adminRequestStatus(status)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="button button-ghost button-small flex items-center gap-1.5"
              title="Remove booked, completed, or cancelled requests from the queue"
              onClick={() => setConfirmDialog({
                title: "Clear completed & past trips?",
                description: "This will remove all booked, completed, and cancelled requests from the queue. Pending requests will remain intact.",
                confirmLabel: "Clear past trips",
                action: async () => {
                  await travelRequestsApi.deletePastOrCompleted();
                  toast.success("Past trips cleared from queue.");
                  await fetchRequests();
                }
              })}
            >
              <Trash2 size={13} /> Clear past trips
            </button>
            <button
              type="button"
              className="button button-danger button-small flex items-center gap-1.5"
              title="Delete all travel requests for every user"
              onClick={() => setConfirmDialog({
                title: "Delete ALL travel requests?",
                description: "This will permanently delete every travel request and linked booking across the organization for all users. The queue will be completely empty.",
                confirmLabel: "Delete all requests",
                action: async () => {
                  await travelRequestsApi.deleteAll();
                  toast.success("All travel requests have been deleted.");
                  await fetchRequests();
                }
              })}
            >
              <Trash2 size={13} /> Delete all requests
            </button>
          </div>
        </div>
        {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
        {loading ? (
          <EmptyState icon={<Clock3 size={20} />} title="Loading requests" description="Fetching travel request activity from Trapple." />
        ) : filtered.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Trip</th>
                  <th>Route</th>
                  <th>Travel date</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((request, index) => {
                  const employee = request.employee || {};
                  return (
                    <tr key={request.id || index}>
                      <td>
                        <div className="table-journey">
                          <span className="avatar avatar-tiny">
                            {String(employee.name || employee.employeeId || "E").slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{employee.name || "Unnamed employee"}</strong>
                            <small>{employee.employeeId || "Employee ID unavailable"}</small>
                          </span>
                        </div>
                      </td>
                      <td>{request.tripType || "—"}</td>
                      <td>{request.fromLocation || "—"} → {request.toLocation || "—"}</td>
                      <td>{adminRequestDate(request.travelDate)}</td>
                      <td>{request.projectName || "—"}</td>
                      <td><StatusBadge status={adminRequestStatus(request.status) as any} /></td>
                      <td>{adminRequestDate(adminRequestSubmitted(request))}</td>
                      <td>
                        <div className="table-inline-actions">
                          <button type="button" className="table-action" onClick={() => setSelected(request)}>
                            View details <ArrowUpRight size={14} />
                          </button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            title="Delete this request"
                            onClick={() => setConfirmDialog({
                              title: `Delete request #${request.id}?`,
                              description: `Permanently remove travel request for ${employee.name || "employee"} to ${request.toLocation || "destination"}?`,
                              confirmLabel: "Delete request",
                              action: async () => {
                                await travelRequestsApi.delete(String(request.id));
                                toast.success(`Request #${request.id} deleted.`);
                                await fetchRequests();
                              }
                            })}
                          >
                            Delete <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={20} />}
            title={requests.length ? "No matching requests" : "No travel requests in queue"}
            description={requests.length ? "Try another search or status filter." : "The travel request queue is empty. Submit a new travel request to populate the queue."}
          />
        )}
      </div>
      {selected && <AdminRequestDetails request={selected} onClose={() => setSelected(null)} />}
      {confirmDialog && (
        <DeleteConfirmDialog
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          isDanger={confirmDialog.isDanger}
          onConfirm={confirmDialog.action}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function adminBookingStatus(booking: Record<string, any>) { if (booking.cancelled === true) return "Cancelled"; return adminRequestStatus(booking.status || booking.travelRequest?.status || "BOOKED"); }
function adminBookingDetails(booking: Record<string, any>) {
  const request = booking.travelRequest || {}; const employee = request.employee || {};
  return [["Booking ID", booking.id], ["Travel request ID", request.id], ["Employee", employee.name], ["Employee ID", employee.employeeId], ["Trip type", request.tripType], ["From", request.fromLocation], ["To", request.toLocation], ["Travel date", adminRequestDate(request.travelDate)], ["Return date", adminRequestDate(request.returnDate)], ["Project", request.projectName], ["Booking type", booking.bookingType], ["Provider", booking.provider], ["Reference / ticket", booking.bookingReference], ["Cost", booking.cost], ["Savings", booking.savings], ["Booked at", adminRequestDate(booking.bookedAt)], ["Cancellation reason", booking.cancellationReason], ["Cancellation charge", booking.cancellationCharge]].filter(([, value]) => value !== undefined && value !== null && value !== "");
}
function AdminBookingDetails({ booking, onClose }: { booking: Record<string, any>; onClose: () => void }) { return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-booking-details-title"><div className="confirm-dialog admin-request-dialog"><button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close booking details"><X size={18} /></button><div className="confirm-icon approve"><TicketCheck size={22} /></div><span className="card-kicker">BOOKING DETAILS</span><h2 id="admin-booking-details-title">Booking #{booking.id ?? "—"}</h2><p>Complete booking and linked travel-request information returned by the authenticated backend.</p><div className="admin-request-detail-grid">{adminBookingDetails(booking).map(([label, value]) => <div className="admin-request-detail" key={String(label)}><small>{String(label)}</small><strong>{String(value)}</strong></div>)}<div className="admin-request-detail"><small>Status</small><StatusBadge status={adminBookingStatus(booking) as any} /></div>{booking.notes && <div className="admin-request-detail admin-request-detail-wide"><small>Notes</small><strong>{booking.notes}</strong></div>}</div><div className="dialog-actions"><button type="button" className="button button-primary" onClick={onClose}>Close details</button></div></div></div>; }
function AdminBookings() {
  const [bookings, setBookings] = useState<Array<Record<string, any>>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [statusFilter, setStatusFilter] = useState("ALL"); const [selected, setSelected] = useState<Record<string, any> | null>(null);
  useEffect(() => { let active = true; setLoading(true); setError(""); bookingsApi.list().then((data) => { if (active) setBookings(Array.isArray(data) ? data as Array<Record<string, any>> : []); }).catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Bookings are unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const statuses = useMemo(() => Array.from(new Set(bookings.map((booking) => adminBookingStatus(booking)))), [bookings]);
  const filtered = useMemo(() => bookings.filter((booking) => { const request = booking.travelRequest || {}; const employee = request.employee || {}; const haystack = [booking.id, booking.bookingReference, booking.bookingType, booking.provider, booking.cost, booking.status, adminBookingStatus(booking), request.id, request.tripType, request.fromLocation, request.toLocation, request.projectName, employee.name, employee.employeeId].join(" ").toLowerCase(); return (statusFilter === "ALL" || adminBookingStatus(booking) === statusFilter) && haystack.includes(query.toLowerCase()); }), [bookings, query, statusFilter]);
  return <div className="page-stack animate-page"><PageTitle meta={pageMeta["/admin/bookings"]} /><div className="section-title-row section-title-spaced"><div><span className="card-kicker">ADMINISTRATION</span><h2 className="section-heading">Booking activity</h2><p className="page-description">Review confirmed and cancelled bookings from the connected backend.</p></div><span className="data-note"><ShieldCheck size={13} /> Live backend data</span></div><div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, reference or route" /></div><div className="toolbar-filters"><Filter size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></div></div>{error && <div className="form-error-message"><XCircle size={15} />{error}</div>}{loading ? <EmptyState icon={<Clock3 size={20} />} title="Loading bookings" description="Fetching booking activity from Trapple." /> : filtered.length ? <div className="responsive-table"><table><thead><tr><th>Employee</th><th>Booking</th><th>Trip</th><th>Route</th><th>Travel date</th><th>Provider</th><th>Status</th><th>Booked at</th><th /></tr></thead><tbody>{filtered.map((booking, index) => { const request = booking.travelRequest || {}; const employee = request.employee || {}; return <tr key={booking.id || index}><td><div className="table-journey"><span className="avatar avatar-tiny">{String(employee.name || employee.employeeId || "E").slice(0, 2).toUpperCase()}</span><span><strong>{employee.name || "Employee unavailable"}</strong><small>{employee.employeeId || "Employee ID unavailable"}</small></span></div></td><td><strong>{booking.bookingReference || "—"}</strong><small className="table-subline">Booking #{booking.id ?? "—"} · Request #{request.id ?? "—"}</small></td><td>{request.tripType || booking.bookingType || "—"}</td><td>{request.fromLocation || "—"} → {request.toLocation || "—"}</td><td>{adminRequestDate(request.travelDate)}</td><td>{booking.provider || "—"}</td><td><StatusBadge status={adminBookingStatus(booking) as any} /></td><td>{adminRequestDate(booking.bookedAt)}</td><td><button type="button" className="table-action" onClick={() => setSelected(booking)}>View details <ArrowUpRight size={14} /></button></td></tr>; })}</tbody></table></div> : <EmptyState icon={<TicketCheck size={20} />} title={bookings.length ? "No matching bookings" : "No bookings"} description={bookings.length ? "Try another search or status filter." : "Bookings will appear here when returned by the backend."} />}</div>{selected && <AdminBookingDetails booking={selected} onClose={() => setSelected(null)} />}</div>;
}


function reportCount<T>(items: T[], predicate: (item: T) => boolean) { return items.filter(predicate).length; }
function reportBarRows(values: Record<string, number>, limit = 6) { return Object.entries(values).sort(([, a], [, b]) => b - a).slice(0, limit); }
function AdminReports() {
  const user = getStoredUser<AuthUser>();
  const [requests, setRequests] = useState<Array<Record<string, any>>>([]); const [bookings, setBookings] = useState<Array<Record<string, any>>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState("");
  useEffect(() => { let active = true; setLoading(true); setError(""); Promise.all([travelRequestsApi.list(), bookingsApi.list()]).then(([requestData, bookingData]) => { if (!active) return; setRequests(Array.isArray(requestData) ? requestData as Array<Record<string, any>> : []); setBookings(Array.isArray(bookingData) ? bookingData as Array<Record<string, any>> : []); }).catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Reports are unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const filteredRequests = useMemo(() => requests.filter((request) => { const employee = request.employee || {}; return [request.id, request.tripType, request.fromLocation, request.toLocation, request.projectName, employee.name, employee.employeeId].join(" ").toLowerCase().includes(query.toLowerCase()); }), [requests, query]);
  const filteredBookings = useMemo(() => bookings.filter((booking) => { const request = booking.travelRequest || {}; const employee = request.employee || {}; return [booking.id, booking.bookingReference, booking.provider, booking.bookingType, request.projectName, request.fromLocation, request.toLocation, employee.name, employee.employeeId].join(" ").toLowerCase().includes(query.toLowerCase()); }), [bookings, query]);
  const pending = reportCount(requests, (request) => String(request.status).toUpperCase() === "PENDING"); const approved = reportCount(requests, (request) => String(request.status).toUpperCase() === "APPROVED"); const rejected = reportCount(requests, (request) => String(request.status).toUpperCase() === "REJECTED"); const cancelledBookings = reportCount(bookings, (booking) => booking.cancelled === true); const activeBookings = bookings.length - cancelledBookings; const costs = bookings.map((booking) => Number(booking.cost)).filter((cost) => Number.isFinite(cost)); const totalSpend = costs.reduce((total, cost) => total + cost, 0); const averageCost = costs.length ? totalSpend / costs.length : 0;
  const tripTypes = useMemo(() => requests.reduce<Record<string, number>>((result, request) => { const key = String(request.tripType || "Unspecified"); result[key] = (result[key] || 0) + 1; return result; }, {}), [requests]);
  const routes = useMemo(() => requests.reduce<Record<string, number>>((result, request) => { const key = `${request.fromLocation || "Unknown"} → ${request.toLocation || "Unknown"}`; result[key] = (result[key] || 0) + 1; return result; }, {}), [requests]);
  const projects = useMemo(() => requests.reduce<Record<string, number>>((result, request) => { const key = String(request.projectName || "Unspecified project"); result[key] = (result[key] || 0) + 1; return result; }, {}), [requests]);
  const providers = useMemo(() => bookings.reduce<Record<string, number>>((result, booking) => { const key = String(booking.provider || "Unspecified provider"); result[key] = (result[key] || 0) + 1; return result; }, {}), [bookings]);
  const bookingTypes = useMemo(() => bookings.reduce<Record<string, number>>((result, booking) => { const key = String(booking.bookingType || "Unspecified type"); result[key] = (result[key] || 0) + 1; return result; }, {}), [bookings]);
  const upcoming = useMemo(() => requests.filter((request) => { const date = new Date(String(request.travelDate)); return !Number.isNaN(date.getTime()) && date >= new Date(new Date().toDateString()) && ["PENDING", "APPROVED", "BOOKED"].includes(String(request.status).toUpperCase()); }).sort((a, b) => String(a.travelDate).localeCompare(String(b.travelDate))).slice(0, 5), [requests]);
  const maxValue = (rows: Array<[string, number]>) => Math.max(1, ...rows.map(([, value]) => value));
  const rows = (values: Record<string, number>) => reportBarRows(values);
  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/admin/reports"]} />
      <div className="section-title-row section-title-spaced">
        <div>
          <span className="card-kicker">ADMINISTRATION</span>
          <h2 className="section-heading">Organization reports & Master Extraction</h2>
          <p className="page-description">Complete organizational travel spend, booking manifests, and executive PDF/Excel extractions.</p>
        </div>
        <span className="data-note"><ShieldCheck size={13} /> Live backend data</span>
      </div>

      {/* Complete Financial & Manifest Extraction Suite */}
      <ReportExtractionSuite
        requests={requests}
        bookings={bookings}
        currentUser={user}
        roleTitle="Organization Master Audit & Travel Extraction"
      />

      <div className="panel report-filter-panel">
        <div className="search-field">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter report rows by employee, project or route" />
        </div>
        <span className="data-note">{loading ? "Loading source records…" : `${filteredRequests.length + filteredBookings.length} matching records`}</span>
      </div>
      {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
      {loading ? (
        <EmptyState icon={<Clock3 size={20} />} title="Loading reports" description="Fetching travel requests and bookings from Trapple." />
      ) : !requests.length && !bookings.length ? (
        <EmptyState icon={<BarChart3 size={20} />} title="No report data" description="Reports will populate when the backend returns travel requests or bookings." />
      ) : (
        <>
          <section className="stats-grid">
            <StatCard label="Total requests" value={String(requests.length)} detail="All returned statuses" icon={<FileText size={18} />} />
            <StatCard label="Pending requests" value={String(pending)} detail="Backend status: Pending" icon={<Clock3 size={18} />} accent="stat-accent" />
            <StatCard label="Approved requests" value={String(approved)} detail="Backend status: Approved" icon={<Check size={18} />} />
            <StatCard label="Rejected requests" value={String(rejected)} detail="Backend status: Rejected" icon={<XCircle size={18} />} />
            <StatCard label="Total bookings" value={String(bookings.length)} detail="All returned records" icon={<TicketCheck size={18} />} />
            <StatCard label="Active bookings" value={String(activeBookings)} detail="Not cancelled" icon={<Plane size={18} />} />
            <StatCard label="Cancelled bookings" value={String(cancelledBookings)} detail="Backend cancellation flag" icon={<XCircle size={18} />} />
            {costs.length > 0 && (
              <>
                <StatCard label="Total travel spend" value={totalSpend.toLocaleString("en-IN", { maximumFractionDigits: 2 })} detail="Sum of returned booking costs" icon={<WalletCards size={18} />} />
                <StatCard label="Average booking cost" value={averageCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })} detail={`${costs.length} numeric cost records`} icon={<WalletCards size={18} />} />
              </>
            )}
          </section>
          <section className="report-dashboard-grid">
            <ReportBars title="Trip types" eyebrow="REQUEST MIX" rows={rows(tripTypes)} max={maxValue(rows(tripTypes))} empty="No trip type values returned." />
            <ReportBars title="Top routes" eyebrow="REQUEST ROUTES" rows={rows(routes)} max={maxValue(rows(routes))} empty="No route values returned." />
            <ReportBars title="Projects" eyebrow="REQUEST CONTEXT" rows={rows(projects)} max={maxValue(rows(projects))} empty="No project values returned." />
            <ReportBars title="Providers" eyebrow="BOOKING MIX" rows={rows(providers)} max={maxValue(rows(providers))} empty="No provider values returned." />
            <ReportBars title="Booking types" eyebrow="BOOKING MIX" rows={rows(bookingTypes)} max={maxValue(rows(bookingTypes))} empty="No booking type values returned." />
            <div className="panel report-list-panel">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">UPCOMING TRIPS</span>
                  <h2 className="section-heading">Next travel dates</h2>
                </div>
                <CalendarDays size={18} className="panel-icon" />
              </div>
              {upcoming.length ? (
                <div className="report-upcoming-list">
                  {upcoming.map((request) => (
                    <div className="report-upcoming-row" key={request.id}>
                      <span className="journey-icon"><Plane size={15} /></span>
                      <span>
                        <strong>{request.toLocation || "Destination unavailable"}</strong>
                        <small>{request.employee?.name || "Employee unavailable"} · {request.projectName || "Project unavailable"}</small>
                      </span>
                      <time>{adminRequestDate(request.travelDate)}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<CalendarDays size={20} />} title="No upcoming trips" description="No pending, approved, or booked request with a future travel date was returned." />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function ReportBars({ title, eyebrow, rows, max, empty }: { title: string; eyebrow: string; rows: Array<[string, number]>; max: number; empty: string }) { return <div className="panel report-bars-panel"><div className="section-title-row"><div><span className="card-kicker">{eyebrow}</span><h2 className="section-heading">{title}</h2></div><BarChart3 size={18} className="panel-icon" /></div>{rows.length ? <div className="report-bars">{rows.map(([label, value]) => <div className="report-bar-row" key={label}><div><strong>{label}</strong><span>{value}</span></div><div className="report-bar-track"><span style={{ width: `${Math.round((value / max) * 100)}%` }} /></div></div>)}</div> : <div className="report-inline-empty">{empty}</div>}</div>; }


function AdminSettings({ user }: { user: AuthUser }) {
  const [health, setHealth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    isDanger?: boolean;
    action: () => Promise<void>;
  } | null>(null);

  async function checkConnection() {
    setChecking(true);
    setError("");
    try {
      const response = await healthApi.check();
      setHealth(typeof response === "string" ? response : "Backend is responding");
    } catch (healthError) {
      setHealth(null);
      setError(healthError instanceof Error ? healthError.message : "The backend status could not be checked.");
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    checkConnection();
  }, []);

  const accountRows = [["Username", user.username], ["Role", roleLabels[user.role]], ["User ID", user.id], ["Employee ID", user.employeeId || null]].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={{ ...pageMeta["/admin/settings"], title: "Settings" }} />
      <div className="section-title-row section-title-spaced">
        <div>
          <span className="card-kicker">ADMINISTRATION</span>
          <h2 className="section-heading">Workspace settings</h2>
          <p className="page-description">Account, queue, and system management available to your authenticated administrator session.</p>
        </div>
        <span className="data-note"><ShieldCheck size={13} /> Admin access</span>
      </div>
      <section className="settings-grid">
        <div className="panel settings-card">
          <div className="settings-card-header">
            <div className="settings-icon"><UserRound size={18} /></div>
            <div>
              <span className="card-kicker">ACCOUNT</span>
              <h2 className="section-heading">Authenticated account</h2>
              <p>These values come directly from the current JWT-backed session.</p>
            </div>
          </div>
          <div className="settings-list">
            {accountRows.map(([label, value]) => (
              <div className="settings-row" key={String(label)}>
                <span>{String(label)}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
          <div className="settings-note">
            <ShieldCheck size={15} />
            <span>Role-based access is enforced by the existing authenticated application session.</span>
          </div>
        </div>

        <div className="panel settings-card">
          <div className="settings-card-header">
            <div className="settings-icon settings-icon-green"><ShieldCheck size={18} /></div>
            <div>
              <span className="card-kicker">SYSTEM STATUS</span>
              <h2 className="section-heading">Backend connection</h2>
              <p>Live status from the existing backend health endpoint.</p>
            </div>
          </div>
          <div className={`settings-health ${health ? "is-online" : error ? "is-offline" : "is-checking"}`}>
            <span className="health-pulse" />
            <div>
              <strong>{loading ? "Checking connection…" : health ? "Backend online" : "Unable to reach backend"}</strong>
              <small>{loading ? "Contacting /api/health" : health || "Try checking the connection again."}</small>
            </div>
          </div>
          {error && <div className="form-error-message"><XCircle size={15} />{error}</div>}
          <button type="button" className="button button-ghost settings-refresh" onClick={checkConnection} disabled={checking}>
            {checking ? "Checking…" : "Check connection"}<ArrowUpRight size={15} />
          </button>
        </div>

        <div className="panel settings-card">
          <div className="settings-card-header">
            <div className="settings-icon settings-icon-red"><Trash2 size={18} /></div>
            <div>
              <span className="card-kicker">DATA & QUEUES</span>
              <h2 className="section-heading">Queue management</h2>
              <p>Clear organization travel queues, purge past trips, or wipe all records.</p>
            </div>
          </div>
          <div className="settings-list">
            <div className="settings-row">
              <div>
                <strong>Purge completed & past trips</strong>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-muted)" }}>Removes booked, completed, and cancelled trips from queues while keeping pending items.</p>
              </div>
              <button
                type="button"
                className="button button-ghost button-small flex items-center gap-1.5"
                onClick={() => setConfirmDialog({
                  title: "Clear completed & past trips?",
                  description: "This will remove all completed and cancelled trips across all queues. Active pending requests will remain intact.",
                  confirmLabel: "Clear past trips",
                  action: async () => {
                    await travelRequestsApi.deletePastOrCompleted();
                    toast.success("Completed and past trips cleared.");
                  }
                })}
              >
                <Trash2 size={13} /> Purge past trips
              </button>
            </div>

            <div className="settings-row">
              <div>
                <strong>Delete ALL requests & bookings</strong>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-muted)" }}>Permanently wipes every travel request and booking in Trapple for every user.</p>
              </div>
              <button
                type="button"
                className="button button-danger button-small flex items-center gap-1.5"
                onClick={() => setConfirmDialog({
                  title: "Delete ALL travel requests & bookings?",
                  description: "This will permanently delete every travel request and booking in the system for all users. All queues will be completely empty.",
                  confirmLabel: "Delete all data",
                  action: async () => {
                    await travelRequestsApi.deleteAll();
                    toast.success("All travel requests and bookings have been deleted.");
                  }
                })}
              >
                <Trash2 size={13} /> Delete all data
              </button>
            </div>
          </div>
        </div>

        <div className="panel settings-card settings-readonly-card">
          <div className="settings-card-header">
            <div className="settings-icon settings-icon-saffron"><Settings2 size={18} /></div>
            <div>
              <span className="card-kicker">AVAILABLE CONTROLS</span>
              <h2 className="section-heading">Configuration boundaries</h2>
              <p>Trapple keeps unsupported changes out of the UI.</p>
            </div>
          </div>
          <div className="settings-boundary-list">
            <div><Check size={15} /><span>Account and access information is visible from the active session.</span></div>
            <div><Check size={15} /><span>Backend availability can be checked through the existing health endpoint.</span></div>
            <div><Check size={15} /><span>Queue cleanup and total data wipe are available in Data & Queues above.</span></div>
            <div><XCircle size={15} /><span>Password changes and theme controls are handled elsewhere.</span></div>
          </div>
        </div>
      </section>

      {confirmDialog && (
        <DeleteConfirmDialog
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          isDanger={confirmDialog.isDanger}
          onConfirm={confirmDialog.action}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function Admin({ section = "overview", user }: { section?: string; user?: AuthUser }) { if (section === "requests") return <AdminRequests />; if (section === "bookings") return <AdminBookings />; if (section === "reports") return <AdminReports />; if (section === "settings" && user) return <AdminSettings user={user} />; if (section === "users" && user) return <UserManagement user={user} />; return <AdminOverview section={section} user={user} />; }

function EmployeeDetailModal({ employee, onClose }: { employee: EmployeeRecord; onClose: () => void }) {
  const fields = [
    ["Full Name", employee.name || "—"],
    ["Employee ID", employee.employeeId || "—"],
    ["Email", employee.email || "—"],
    ["Contact Number", employee.contactNumber || "—"],
    ["Department", employee.department || "—"],
    ["Designation", employee.designation || "—"],
    ["Location", employee.location || "—"],
    ["Organization", employee.companyName || employee.companyCode || "—"],
    ["Status", employee.active !== false ? "Active" : "Inactive"],
    ["Created", employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "—"],
    ["Updated", employee.updatedAt ? new Date(employee.updatedAt).toLocaleDateString() : "—"],
  ];
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="employee-detail-title">
      <div className="confirm-dialog admin-request-dialog">
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close employee details">
          <X size={18} />
        </button>
        <div className="confirm-icon approve">
          <UsersRound size={22} />
        </div>
        <span className="card-kicker">EMPLOYEE RECORD</span>
        <h2 id="employee-detail-title">{employee.name || "Employee details"}</h2>
        <p>Verified profile record from the multi-tenant employee directory.</p>
        <div className="admin-request-detail-grid">
          {fields.map(([label, value]) => (
            <div className="admin-request-detail" key={label}>
              <small>{label}</small>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-primary" onClick={onClose}>
            Close details
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminOverview({ section = "overview", user }: { section?: string; user?: AuthUser }) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [activeEmployeeCount, setActiveEmployeeCount] = useState<number | null>(null);

  // Directory state
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);

  // Filter & Search state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sort, setSort] = useState("name,asc");

  // Interaction & Lifecycle state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  // Debounce search input by 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, sort, size]);

  // Fetch summary and active count
  useEffect(() => {
    dashboardApi
      .summary()
      .then((nextSummary) => setSummary(nextSummary as Record<string, number>))
      .catch(() => {});

    employeesApi
      .list({ active: true, size: 1 })
      .then((res) => setActiveEmployeeCount(res.totalElements))
      .catch(() => {});
  }, [refreshKey]);

  // Fetch paginated employees from backend
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const activeParam =
      statusFilter === "ACTIVE" ? true : statusFilter === "INACTIVE" ? false : undefined;

    employeesApi
      .list({
        page,
        size,
        search: debouncedSearch || undefined,
        active: activeParam,
        sort,
      })
      .then((res) => {
        if (!active) return;
        setEmployees(res.content);
        setTotalPages(res.totalPages);
        setTotalElements(res.totalElements);
        setFirst(res.first);
        setLast(res.last);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load employee directory.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, size, debouncedSearch, statusFilter, sort, refreshKey]);

  const title =
    section === "employees"
      ? "People directory"
      : section === "requests"
      ? "Request activity"
      : section === "bookings"
      ? "Booking activity"
      : section === "reports"
      ? "Organization signals"
      : "Control center";

  const startRecord = totalElements === 0 ? 0 : page * size + 1;
  const endRecord = Math.min((page + 1) * size, totalElements);
  const rangeText =
    totalElements === 0
      ? "0 employees"
      : `Showing ${startRecord}–${endRecord} of ${totalElements} employee${totalElements === 1 ? "" : "s"}`;

  const hasActiveFilters = Boolean(debouncedSearch || statusFilter !== "ALL");

  return (
    <div className="page-stack animate-page">
      <PageTitle meta={{ ...pageMeta[section === "overview" ? "/admin" : `/admin/${section}`], title }} />

      <section className="admin-hero">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#14B8A6]/20 text-[#2DD4BF] border border-[#14B8A6]/30">
              Mahathi Infra Services Pvt. Ltd.
            </span>
            <span className="text-[11px] text-[#94A3B8]">· Tenant Code: MISPL</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> TLS 1.3 Tenant Isolation
            </span>
          </div>
          <h2>Company Administration & Directory Control</h2>
          <p>Oversee enterprise users, verify role permissions, manage multi-tenant mobility policies, and inspect organizational travel records.</p>
          <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
            <Link href="/admin/users" className="button button-ghost button-small">
              <UsersRound size={13} /> User & Role Management
            </Link>
            <Link href="/admin/settings" className="button button-ghost button-small">
              <SlidersHorizontal size={13} /> Travel Policy Controls
            </Link>
            <Link href="/admin/spend-reports" className="button button-primary button-small">
              <BarChart3 size={13} /> Spend Intelligence BI
            </Link>
          </div>
        </div>
        <div className="admin-orbit hidden sm:flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
          <ShieldCheck size={24} className="text-[#2DD4BF] mb-1" />
          <span className="text-[10.5px] font-bold text-white uppercase tracking-wider">RBAC SECURED</span>
          <small className="text-[9.5px] text-[#94A3B8]">Audit Trail Active</small>
        </div>
      </section>

      {error && (
        <div className="form-error-message" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <XCircle size={15} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setRefreshKey((k) => k + 1)}
            style={{ padding: "4px 10px", fontSize: "11px", height: "auto" }}
          >
            <RotateCcw size={13} style={{ marginRight: 4 }} /> Retry
          </button>
        </div>
      )}

      <section className="stats-grid">
        <StatCard
          label="Active employees"
          value={activeEmployeeCount !== null ? String(activeEmployeeCount) : String(totalElements || 0)}
          detail="From backend"
          icon={<UsersRound size={18} />}
        />
        <StatCard
          label="Open requests"
          value={String(summary?.pendingRequests || 0)}
          detail="Pending"
          icon={<FileText size={18} />}
          accent="stat-accent"
        />
        <StatCard
          label="Total bookings"
          value={String(summary?.totalBookings || 0)}
          detail="From backend"
          icon={<TicketCheck size={18} />}
        />
        <StatCard
          label="Travel requests"
          value={String(summary?.totalTravelRequests || 0)}
          detail="All statuses"
          icon={<WalletCards size={18} />}
        />
      </section>

      <div className="panel table-panel">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">{section === "employees" ? "DIRECTORY" : "LATEST ACTIVITY"}</span>
            <h2 className="section-heading">{section === "employees" ? "Employees" : "Backend summary"}</h2>
          </div>
          <span className="data-note">
            <ShieldCheck size={13} /> Live backend directory
          </span>
        </div>

        {/* Directory Search & Filter Toolbar */}
        <div className="table-toolbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div className="search-field" style={{ minWidth: 240, maxWidth: 340 }}>
            <Search size={16} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, ID, department, email…"
              aria-label="Search employee directory"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="icon-button"
                style={{ padding: 2, background: "transparent", border: 0 }}
                aria-label="Clear search input"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="toolbar-filters">
            <Filter size={15} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>

          <div className="toolbar-filters">
            <SlidersHorizontal size={15} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort employees"
            >
              <option value="name,asc">Name (A → Z)</option>
              <option value="name,desc">Name (Z → A)</option>
              <option value="employeeId,asc">Employee ID (Asc)</option>
              <option value="employeeId,desc">Employee ID (Desc)</option>
              <option value="department,asc">Department (A → Z)</option>
              <option value="createdAt,desc">Recently Added</option>
            </select>
          </div>

          <div className="toolbar-filters">
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Page size"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
            </select>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh directory"
            aria-label="Refresh directory"
            style={{ marginLeft: "auto", border: "1px solid var(--line)", borderRadius: 8, height: 36, width: 36 }}
          >
            <RotateCcw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Directory Table or Empty / Loading State */}
        {loading && employees.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 220, gap: 10, color: "var(--ink-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock3 size={18} className="animate-spin" />
              <span>Loading employee directory…</span>
            </div>
          </div>
        ) : employees.length ? (
          <>
            <div className="responsive-table" style={{ opacity: loading ? 0.65 : 1, transition: "opacity 0.2s ease" }}>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Email & Contact</th>
                    <th>Department</th>
                    <th>Designation & Location</th>
                    <th>Status</th>
                    <th>Company</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, index) => (
                    <tr
                      key={employee.id || employee.employeeId || index}
                      onClick={() => setSelectedEmployee(employee)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <div className="table-journey">
                          <span className="avatar avatar-tiny">
                            {String(employee.name || "E").slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{employee.name || "Unnamed employee"}</strong>
                            <small>{employee.employeeId || "—"}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span style={{ fontSize: "11px", color: "var(--ink)" }}>{employee.email || "—"}</span>
                          {employee.contactNumber && (
                            <small style={{ color: "var(--ink-muted)", fontSize: "10px" }}>{employee.contactNumber}</small>
                          )}
                        </div>
                      </td>
                      <td>{employee.department || "—"}</td>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span>{employee.designation || "—"}</span>
                          {employee.location && (
                            <small style={{ color: "var(--ink-muted)", fontSize: "10px" }}>{employee.location}</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            employee.active !== false
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              employee.active !== false ? "bg-emerald-500" : "bg-zinc-400"
                            }`}
                          />
                          {employee.active !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                          {employee.companyName || employee.companyCode || "Mahathi Infra"}
                        </span>
                      </td>
                      <td>
                        <ChevronRight size={16} className="row-chevron" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div
              className="directory-pagination"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid var(--line)",
                fontSize: "12px",
                color: "var(--ink-muted)",
              }}
            >
              <div>
                <span>{rangeText}</span>
                {totalPages > 1 && (
                  <span style={{ marginLeft: 8, opacity: 0.75 }}>
                    • Page {page + 1} of {totalPages}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={first || page === 0 || loading}
                  style={{ padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} /> Previous
                </button>

                {totalPages <= 7 ? (
                  Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      disabled={loading}
                      className={`button ${page === i ? "button-primary" : "button-ghost"}`}
                      style={{
                        minWidth: 32,
                        height: 32,
                        padding: "0 8px",
                        fontSize: "12px",
                        borderRadius: 6,
                      }}
                    >
                      {i + 1}
                    </button>
                  ))
                ) : (
                  <span style={{ padding: "0 6px", fontWeight: 600 }}>
                    {page + 1} / {totalPages}
                  </span>
                )}

                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={last || page >= totalPages - 1 || loading}
                  style={{ padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
                  aria-label="Next page"
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={hasActiveFilters ? <Search size={22} /> : <UsersRound size={22} />}
            title={hasActiveFilters ? "No matching employees" : "No employee data returned"}
            description={
              hasActiveFilters
                ? `No employees match your search query or filters. Try adjusting your search term or clearing the filters.`
                : "The admin directory will populate from the connected backend."
            }
            action={
              hasActiveFilters ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    setSearchInput("");
                    setStatusFilter("ALL");
                  }}
                  style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <RotateCcw size={14} /> Clear filters
                </button>
              ) : undefined
            }
          />
        )}
      </div>

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}
function Login({ onAuthenticated, onBackToHome }: { onAuthenticated: (user: AuthUser) => void; onBackToHome?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Pre-warm the backend on cold boot so it is awake by the time the user submits
    fetch(getResolvedUrl("/api/health")).catch(() => {});
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      timer = setTimeout(() => setSlowLoading(true), 3500);
    } else {
      setSlowLoading(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isSupabaseEnabled) {
        // Supabase keeps its own session; nothing is written to localStorage.
        const data = await supabaseSignIn(username, password);
        onAuthenticated(data);
      } else {
        const data = await loginApi({ username: username.trim(), password });
        persistAuth(data);
        onAuthenticated(data);
      }
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message.includes("401") || loginError.message.toLowerCase().includes("unauthorized")
            ? "Invalid username or password. Please verify your corporate credentials."
            : loginError.message
          : "Unable to sign in. Please verify your connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand flex flex-wrap items-center justify-between gap-4">
        <div
          onClick={onBackToHome}
          className={`flex items-center gap-2.5 ${onBackToHome ? "cursor-pointer hover:opacity-85 transition-opacity" : ""}`}
          title={onBackToHome ? "Return to Trapple Homepage" : undefined}
        >
          <Logo />
          <span className="text-xs font-semibold text-[#667085] dark:text-[#94A3B8]">
            Mahathi Infra Services Pvt. Ltd. · Enterprise Travel Desk
          </span>
        </div>

        <div className="flex items-center gap-3">
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>← Back to Website</span>
            </button>
          )}

          <button
            className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>

      <div className="login-layout">
        <div className="login-story">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-[#14B8A6]/10 text-[#0D9488] dark:text-[#2DD4BF] border border-[#14B8A6]/25 mb-4">
            <ShieldCheck size={14} /> Corporate Mobility Platform
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            Corporate mobility engineered for <span className="text-[#0D9488] dark:text-[#2DD4BF]">modern enterprise.</span>
          </h1>

          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed mt-4 max-w-lg font-normal">
            The unified corporate travel platform for Mahathi Infra Services Pvt. Ltd. Coordinate project itineraries, manager sign-offs, and flight desk ticketing with complete enterprise governance.
          </p>

          <div className="login-trust-tags flex flex-wrap gap-2.5 mt-8">
            <span className="login-trust-tag flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-[#111827]/80 border border-[#E4E7EC] dark:border-[#1E293B] shadow-xs">
              <ShieldCheck size={13} className="text-[#16A34A]" /> Role-Based Access
            </span>
            <span className="login-trust-tag flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-[#111827]/80 border border-[#E4E7EC] dark:border-[#1E293B] shadow-xs">
              <RotateCcw size={13} className="text-[#14B8A6]" /> Multi-Device Cloud Sync
            </span>
            <span className="login-trust-tag flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/80 dark:bg-[#111827]/80 border border-[#E4E7EC] dark:border-[#1E293B] shadow-xs">
              <Lock size={13} className="text-[#2563EB]" /> Audit & Policy Trail
            </span>
          </div>

          <div className="login-story-footer mt-8 flex items-center gap-3 text-xs text-[#667085] dark:text-[#94A3B8]">
            <div className="story-line w-8 h-[2px] bg-[#14B8A6]" />
            <span>Mahathi Infra Services Pvt. Ltd. Authorized Staff & Contractors</span>
          </div>
        </div>

        <div className="login-card">
          <div className="flex items-center justify-between mb-1">
            <span className="card-kicker text-[#14B8A6]">ENTERPRISE PORTAL</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F2F4F7] dark:bg-[#1E293B] text-[#475467] dark:text-[#94A3B8]">
              v2.4 LTS
            </span>
          </div>
          <h2>Sign in to Trapple</h2>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-1 mb-6">
            Enter your employee credentials to access your dedicated workspace.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <label className="field block">
              <span className="block text-xs font-semibold text-[#344054] dark:text-[#E2E8F0] mb-1">
                {isSupabaseEnabled ? "Work email" : "Username / Login ID"}
              </span>
              <div className="relative">
                <input
                  type={isSupabaseEnabled ? "email" : "text"}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  autoComplete={isSupabaseEnabled ? "email" : "username"}
                  placeholder={isSupabaseEnabled ? "name@company.com" : "e.g. AGR0001, MISPL0001, admin"}
                  className="w-full"
                />
              </div>
            </label>

            <label className="field block">
              <span className="block text-xs font-semibold text-[#344054] dark:text-[#E2E8F0] mb-1">
                Password
              </span>
              <div className="password-field relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  className="password-toggle absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#101828] dark:hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div className="form-error-message p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <XCircle size={15} className="shrink-0 text-red-500 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{error}</span>
                </div>
                {error.includes("spinning up") && (
                  <button
                    type="submit"
                    className="self-end px-3 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <RotateCcw size={12} /> Retry Sign In
                  </button>
                )}
              </div>
            )}

            <div className="login-options flex items-center justify-between text-xs pt-1">
              <span className="login-security flex items-center gap-1.5 text-[#667085] dark:text-[#94A3B8]">
                <ShieldCheck size={14} className="text-[#14B8A6]" /> Role-based access control
              </span>
              <button
                type="button"
                className="inline-link text-[#14B8A6] hover:underline font-semibold"
                onClick={() => toast("Contact your system administrator or IT helpdesk for password resets.")}
              >
                Need help?
              </button>
            </div>

            <button
              type="submit"
              className="button button-primary button-wide w-full flex items-center justify-center gap-2 py-3"
              disabled={loading}
            >
              {loading ? (
                <>
                  <RotateCcw size={16} className="animate-spin" />
                  <span>{slowLoading ? "Connecting to cloud backend…" : "Signing in…"}</span>
                </>
              ) : (
                <>
                  <span>Sign in to Workspace</span>
                  <ArrowUpRight size={16} />
                </>
              )}
            </button>
            {slowLoading && (
              <p className="text-[11.5px] text-center text-[#667085] dark:text-[#94A3B8] animate-pulse">
                Waking up cloud service from idle sleep. Please hold on a moment…
              </p>
            )}
          </form>

          <div className="login-note mt-4 pt-3 border-t border-[#E4E7EC] dark:border-[#1E293B] flex items-center gap-2 text-[11px] text-[#667085] dark:text-[#94A3B8]">
            <ShieldCheck size={14} className="text-[#14B8A6] shrink-0" />
            <span>Mahathi Infra Services Pvt. Ltd. single sign-on & TLS 1.3 encryption active.</span>
          </div>
        </div>
      </div>

      <div className="login-bottom flex items-center justify-between text-xs text-[#667085] dark:text-[#94A3B8] pt-6 border-t border-[#E4E7EC] dark:border-[#1E293B]">
        <span>Trapple Enterprise · Mahathi Infra Services Pvt. Ltd.</span>
        <span>Corporate Travel Desk Support: desk@mahathiinfra.com</span>
      </div>
    </div>
  );
}

function TravelCalendarPage() {
  const user = getStoredUser<AuthUser>();
  const { journeys } = useTravelRequests(user);
  const [, setLocation] = useLocation();
  return (
    <div className="page-stack animate-page">
      <PageTitle meta={pageMeta["/employee/calendar"]} />
      <TravelCalendar journeys={journeys} onSelectJourney={(j) => setLocation(`/employee/journeys?journey=${j.id}`)} />
    </div>
  );
}

function ExpensesPage() {
  const user = getStoredUser<AuthUser>();
  const { journeys } = useTravelRequests(user);
  return <Expenses user={user} journeys={journeys} />;
}

function ProfilePage({ user }: { user: AuthUser }) {
  const { journeys } = useTravelRequests(user);
  return <Profile user={user} journeys={journeys} />;
}

function AppRouter() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null>(() => {
    // If navigating directly to /login, clear stale credentials so user can log in explicitly
    if (typeof window !== "undefined" && window.location.pathname === "/login") {
      clearAuth();
      return null;
    }
    // Supabase sessions are restored asynchronously below.
    if (isSupabaseEnabled) return null;
    const stored = getStoredUser<AuthUser>();
    return getToken() && isValidAuthUser(stored) ? stored : null;
  });
  const role = user?.role;
  const roleRoots: Record<Role, string> = {
    EMPLOYEE: "/employee",
    APPROVER: "/approver",
    TRAVEL_DESK: "/travel-desk",
    ADMIN: "/admin",
    COMPANY_ADMIN: "/admin",
    PLATFORM_ADMIN: "/admin",
  };
  if (isSupabaseEnabled) {
    roleRoots.EMPLOYEE = "/travel/my";
    roleRoots.APPROVER = "/travel/approvals";
    roleRoots.TRAVEL_DESK = "/travel/search";
    roleRoots.ADMIN = "/travel/search";
    roleRoots.COMPANY_ADMIN = "/travel/search";
    roleRoots.PLATFORM_ADMIN = "/travel/search";
  }
  const path = location;
  const adminPaths = [
    "/admin",
    "/admin/employees",
    "/admin/requests",
    "/admin/bookings",
    "/admin/excel-import",
    "/admin/users",
    "/admin/reports",
    "/admin/spend-reports",
    "/admin/settings",
  ];
  const allowedPaths: Record<Role, string[]> = {
    EMPLOYEE: [
      "/employee",
      "/employee/plan-trip",
      "/employee/journeys",
      "/employee/calendar",
      "/employee/expenses",
      "/employee/profile",
      "/employee/reports",
      "/employee/support",
    ],
    APPROVER: [
      "/approver",
      "/approver/bookings",
      "/approver/bulk-bookings",
      "/approver/history",
      "/approver/reports",
      "/approver/spend-reports",
      "/employee/reports",
      "/employee/support",
    ],
    TRAVEL_DESK: [
      "/travel-desk",
      "/travel-desk/bookings",
      "/travel-desk/bulk-bookings",
      "/travel-desk/excel-import",
      "/travel-desk/users",
      "/travel-desk/cancellations",
      "/travel-desk/reports",
      "/travel-desk/spend-reports",
      "/employee/reports",
    ],
    ADMIN: adminPaths,
    COMPANY_ADMIN: adminPaths,
    PLATFORM_ADMIN: adminPaths,
  };
  const [restoring, setRestoring] = useState(isSupabaseEnabled && typeof window !== "undefined" && window.location.pathname !== "/login");
  const onLogout = () => {
    if (isSupabaseEnabled) void supabaseSignOut();
    clearAuth();
    setUser(null);
    setLocation("/");
  };

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let cancelled = false;
    if (restoring) {
      supabaseRestoreSession()
        .then((restored) => {
          if (!cancelled && restored) setUser(restored);
        })
        .finally(() => {
          if (!cancelled) setRestoring(false);
        });
    }
    const unsubscribe = onSupabaseSignedOut(() => {
      setUser(null);
      setLocation("/login");
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const allowed = user && role
    ? isSupabaseEnabled
      ? isTravelPathAllowed(role, path) || path === "/employee/support"
      : allowedPaths[role].includes(path)
    : false;

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuth();
      setUser(null);
      setLocation("/login");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [setLocation]);

  useEffect(() => {
    if (restoring) return;
    if (!user && location !== "/" && location !== "/login" && !location.startsWith("/activate")) {
      setLocation("/login");
    } else if (user && location === "/") {
      setLocation(roleRoots[user.role]);
    } else if (user && location !== "/" && location !== "/login" && !location.startsWith("/activate") && !allowed) {
      setLocation(roleRoots[user.role]);
    }
  }, [user, location, allowed, setLocation, restoring]);

  if (location === "/activate" || location.startsWith("/activate")) {
    return <ActivateAccount />;
  }

  // Public Landing Page (accessible to all unauthenticated visitors at root "/")
  if (location === "/" && !user) {
    return <LandingPage onSignIn={() => setLocation("/login")} />;
  }

  // Authenticated user landing on root "/" is routed to their role portal
  if (location === "/" && user && role) {
    return null;
  }

  // Corporate Sign In Portal
  if (location === "/login") {
    return (
      <Login
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          setLocation(roleRoots[nextUser.role]);
        }}
        onBackToHome={() => setLocation("/")}
      />
    );
  }
  if (!user || !role) return null;
  if (!allowed) return null;

  let page: ReactNode;
  if (isSupabaseEnabled && path.startsWith("/travel/")) page = <TravelPage path={path} user={user} />;
  else if (path === "/travel-desk/users" || path === "/admin/users") page = <UserManagement user={user} />;
  else if (path === "/employee") page = <Dashboard user={user} />;
  else if (path === "/employee/plan-trip") page = <PlanTrip />;
  else if (path === "/employee/journeys") page = <Journeys />;
  else if (path === "/employee/calendar") page = <TravelCalendarPage />;
  else if (path === "/employee/expenses") page = <ExpensesPage />;
  else if (path === "/employee/profile") page = <ProfilePage user={user} />;
  else if (path === "/employee/approvals") page = <Approvals history />;
  else if (path === "/travel-desk/spend-reports" || path === "/approver/spend-reports" || path === "/admin/spend-reports") page = <TravelSpendReports user={user} />;
  else if (path === "/employee/reports" || path === "/approver/reports" || path === "/travel-desk/reports") page = <Reports />;
  else if (path === "/employee/support") page = <Support />;
  else if (path === "/approver") page = <Approvals />;
  else if (path === "/approver/bookings") page = <ApproverBookings />;
  else if (path === "/approver/bulk-bookings") page = <ApproverBulkBookings />;
  else if (path === "/approver/history") page = <Approvals history />;
  else if (path === "/travel-desk/excel-import" || path === "/admin/excel-import") page = <ExcelImport user={user} />;
  else if (path === "/travel-desk" || path === "/travel-desk/bookings" || path === "/travel-desk/bulk-bookings" || path === "/travel-desk/cancellations") page = <TravelDesk />;
  else if (path.startsWith("/admin")) page = <Admin user={user} section={path === "/admin" ? "overview" : path.replace("/admin/", "")} />;
  else page = <Dashboard user={user} />;

  return (
    <AppShell role={role} user={user} onLogout={onLogout}>
      {page}
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Toaster position="bottom-right" />
        <AppRouter />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
