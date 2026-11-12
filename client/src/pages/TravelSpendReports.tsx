import { useState, useEffect, useMemo } from "react";
import { BarChart3, Download, Search, Layers, UsersRound, Plane, Building2, CalendarDays, RotateCcw, Clock3, ChevronLeft, ChevronRight, ArrowUpRight, Printer, X, Globe, CheckCircle2, Briefcase, Compass, LayoutDashboard, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import ModalPortal from "../components/ModalPortal";
import {
  spendReportsApi,
  type AuthUser,
  type ExecutiveSpendOverview,
  type EmployeeSpendSummary,
  type DepartmentSpendSummary,
  type DestinationAnalysis,
  type VendorSpendSummary,
  type EmployeeDetailedHistory,
  type SpendFilterParams,
  type ProjectSpendSummary,
  type ModalSplitSummary,
  type CreditNoteSummary,
  type JourneySummary,
} from "@/lib/api";

interface TravelSpendReportsProps {
  user: AuthUser;
}

function formatINR(val?: number | null): string {
  if (val == null || isNaN(val)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val);
}

function formatShortINR(val?: number | null): string {
  if (val == null || isNaN(val)) return "₹0";
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
  return `₹${Math.round(val)}`;
}

function getInitials(name?: string | null): string {
  if (!name || name === "—") return "EM";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || "EM").toUpperCase();
}

export function TravelSpendReports({ user }: TravelSpendReportsProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    "overview" | "projects" | "modal-split" | "credit-notes" | "journeys" | "employees" | "departments" | "destinations" | "vendors"
  >("overview");

  // Filters state
  const [period, setPeriod] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Debounce search to eliminate request bursts while typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Filter option lists
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<string[]>([]);

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [overview, setOverview] = useState<ExecutiveSpendOverview | null>(null);
  const [employees, setEmployees] = useState<EmployeeSpendSummary[]>([]);
  const [departments, setDepartments] = useState<DepartmentSpendSummary[]>([]);
  const [destinations, setDestinations] = useState<DestinationAnalysis | null>(null);
  const [vendors, setVendors] = useState<VendorSpendSummary[]>([]);

  // Enterprise BI extension states
  const [projects, setProjects] = useState<ProjectSpendSummary[]>([]);
  const [modalSplit, setModalSplit] = useState<ModalSplitSummary | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNoteSummary | null>(null);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [expandedJourneyId, setExpandedJourneyId] = useState<number | null>(null);

  // Detailed employee modal state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetailedHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Pagination for employee table
  const [employeePage, setEmployeePage] = useState<number>(0);
  const pageSize = 15;

  // Build filter params object using debounced search
  const currentFilter = useMemo<SpendFilterParams>(() => {
    return {
      period: period !== "ALL" && period !== "CUSTOM" ? period : undefined,
      search: debouncedSearch.trim() || undefined,
      department: selectedDept || undefined,
      provider: selectedProvider || undefined,
      fromDate: period === "CUSTOM" && fromDate ? fromDate : undefined,
      toDate: period === "CUSTOM" && toDate ? toDate : undefined,
    };
  }, [period, debouncedSearch, selectedDept, selectedProvider, fromDate, toDate]);

  // Load filter dropdown options once on mount
  useEffect(() => {
    spendReportsApi.getFilterDepartments().then(setDepartmentOptions).catch(() => {});
    spendReportsApi.getFilterProviders().then(setProviderOptions).catch(() => {});
  }, []);

  // Fetch report data with single-call optimization and resilient fallback
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Highly efficient single combined batch endpoint
      const combined = await spendReportsApi.getCombined(currentFilter);
      setOverview(combined.overview);
      setEmployees(combined.employees || []);
      setDepartments(combined.departments || []);
      setDestinations(combined.destinations || null);
      setVendors(combined.vendors || []);
    } catch {
      // 2. Resilient fallback using Promise.allSettled so individual failures don't block the screen
      try {
        const [ovRes, empRes, deptRes, destRes, vendRes] = await Promise.allSettled([
          spendReportsApi.getOverview(currentFilter),
          spendReportsApi.getEmployees(currentFilter),
          spendReportsApi.getDepartments(currentFilter),
          spendReportsApi.getDestinations(currentFilter),
          spendReportsApi.getVendors(currentFilter),
        ]);

        if (ovRes.status === "fulfilled") setOverview(ovRes.value);
        if (empRes.status === "fulfilled") setEmployees(empRes.value);
        if (deptRes.status === "fulfilled") setDepartments(deptRes.value);
        if (destRes.status === "fulfilled") setDestinations(destRes.value);
        if (vendRes.status === "fulfilled") setVendors(vendRes.value);

        const allFailed = [ovRes, empRes, deptRes, destRes, vendRes].every((r) => r.status === "rejected");
        if (allFailed) {
          const firstErr = (ovRes as PromiseRejectedResult).reason;
          setError(firstErr?.message || "Failed to load corporate spend intelligence reports.");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load corporate spend intelligence reports.");
      }
    } finally {
      // Fetch BI extension datasets in parallel
      try {
        const [projRes, modalRes, cnRes, jrnRes] = await Promise.allSettled([
          spendReportsApi.getProjects(currentFilter),
          spendReportsApi.getModalSplit(currentFilter),
          spendReportsApi.getCreditNotes(currentFilter),
          spendReportsApi.getJourneys(currentFilter),
        ]);
        if (projRes.status === "fulfilled") setProjects(projRes.value);
        if (modalRes.status === "fulfilled") setModalSplit(modalRes.value);
        if (cnRes.status === "fulfilled") setCreditNotes(cnRes.value);
        if (jrnRes.status === "fulfilled") setJourneys(jrnRes.value);
      } catch (ignored) {}
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setEmployeePage(0);
  }, [currentFilter]);

  // Handle employee detail view
  const openEmployeeDetail = async (identifier: string) => {
    setSelectedEmployeeId(identifier);
    setDetailLoading(true);
    try {
      const detail = await spendReportsApi.getEmployeeDetail(identifier);
      setEmployeeDetail(detail);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load employee travel ledger.");
      setSelectedEmployeeId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Export handlers
  const handleExport = async (type: string) => {
    try {
      toast.info(`Preparing ${type.replace(/_/g, " ").toLowerCase()} export…`);
      await spendReportsApi.downloadReport(type, currentFilter);
      toast.success("Spend report exported successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export report.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const resetFilters = () => {
    setPeriod("ALL");
    setSearch("");
    setSelectedDept("");
    setSelectedProvider("");
    setFromDate("");
    setToDate("");
  };

  // Filtered/paginated employee list
  const filteredEmployees = useMemo(() => {
    return employees;
  }, [employees]);

  // Spotlight search matched employees
  const matchingEmployees = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const q = debouncedSearch.trim().toLowerCase();
    return employees.filter(
      (e) =>
        e.employeeName.toLowerCase().includes(q) ||
        e.employeeIdentifier.toLowerCase().includes(q) ||
        (e.department && e.department.toLowerCase().includes(q))
    );
  }, [debouncedSearch, employees]);

  const paginatedEmployees = useMemo(() => {
    const start = employeePage * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, employeePage]);

  const totalEmployeePages = Math.ceil(filteredEmployees.length / pageSize);

  // Month-on-month max for chart scaling
  const maxMonthlySpend = useMemo(() => {
    if (!overview?.monthOnMonthSpend?.length) return 1;
    return Math.max(...overview.monthOnMonthSpend.map((m) => m.totalSpend), 1);
  }, [overview]);

  return (
    <div className="travel-spend-reports-container space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 rounded-full">
              CORPORATE TRAVEL INTELLIGENCE
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {user.companyName || "Mahathi Infra Services Pvt. Ltd."}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Travel Spend Reports
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Centralized corporate travel expenditure, employee travel frequency, historical route analytics, and vendor budget intelligence.
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          {user.role === "TRAVEL_DESK" && (
            <a
              href="/travel-desk"
              className="button button-ghost text-xs flex items-center gap-1.5"
              title="Return to Travel Desk Operations Workstation"
            >
              <LayoutDashboard size={14} />
              <span>Operations Desk</span>
            </a>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="button button-ghost text-xs flex items-center gap-1.5"
            title="Print or save as executive PDF presentation"
          >
            <Printer size={15} />
            <span>Print PDF</span>
          </button>

          <div className="dropdown relative inline-block">
            <button
              type="button"
              onClick={() => handleExport("EXECUTIVE_SUMMARY")}
              className="button button-primary text-xs flex items-center gap-1.5"
            >
              <Download size={15} />
              <span>Export Summary (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Period Toggle Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1 flex items-center gap-1">
              <CalendarDays size={14} /> Period:
            </span>
            {[
              { id: "ALL", label: "All Time" },
              { id: "CURRENT_FY", label: "Current FY" },
              { id: "PREVIOUS_FY", label: "Last FY" },
              { id: "CURRENT_MONTH", label: "This Month" },
              { id: "CURRENT_QUARTER", label: "This Quarter" },
              { id: "CUSTOM", label: "Custom Range" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Reset Filters */}
          {(period !== "ALL" || search || selectedDept || selectedProvider || fromDate || toDate) && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <RotateCcw size={13} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Second Row: Search, Dropdowns, Custom Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
          {/* Search Box */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, destination, ticket…"
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Department Dropdown */}
          <div>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Carrier/Provider Dropdown */}
          <div>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white"
            >
              <option value="">All Airlines & Carriers</option>
              {providerOptions.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Date Pickers */}
          {period === "CUSTOM" ? (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white"
                placeholder="From Date"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white"
                placeholder="To Date"
              />
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 px-2">
              <span className="truncate">
                {overview?.dataTraceability.dateRangeStart
                  ? `Active range: ${overview.dataTraceability.dateRangeStart} to ${overview.dataTraceability.dateRangeEnd || "present"}`
                  : "All recorded dates included"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !overview && (
        <div className="py-20 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Clock3 size={18} className="animate-spin text-emerald-500" />
          <span>Aggregating company travel spend intelligence from database…</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          <strong>Unable to load travel spend intelligence:</strong> {error}
        </div>
      )}

      {overview && (
        <>
          {/* SEARCH EMPLOYEE SPOTLIGHT BANNER */}
          {debouncedSearch.trim() && (
            <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <UsersRound size={14} />
                  </span>
                  <div>
                    <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-800 dark:text-emerald-300">
                      Search Results for: &ldquo;{debouncedSearch}&rdquo;
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      {matchingEmployees.length > 0
                        ? `Found ${matchingEmployees.length} matching employee${matchingEmployees.length > 1 ? "s" : ""}`
                        : "Filtered travel spend intelligence records"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {matchingEmployees.length > 0 && activeTab !== "employees" && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("employees")}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>Open Full Employee Analysis</span>
                      <ChevronRight size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  >
                    <X size={13} />
                    <span>Clear search</span>
                  </button>
                </div>
              </div>

              {matchingEmployees.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {matchingEmployees.slice(0, 3).map((emp) => (
                    <div
                      key={emp.employeeIdentifier}
                      className="bg-white dark:bg-slate-900/90 border border-emerald-200/90 dark:border-emerald-800/60 rounded-xl p-4 flex flex-col justify-between shadow-xs hover:shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold text-sm flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                              {getInitials(emp.employeeName)}
                            </span>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                {emp.employeeName}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                                  {emp.employeeIdentifier}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {emp.department || "General"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Spend</span>
                            <strong className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {formatINR(emp.totalSpend)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Trips</span>
                            <strong className="text-sm font-bold text-slate-900 dark:text-white">
                              {emp.tripCount} trips
                            </strong>
                          </div>
                          <div className="col-span-2 pt-1">
                            <span className="text-[10px] text-slate-400">Top Destination: </span>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {emp.topDestination}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openEmployeeDetail(emp.employeeIdentifier)}
                        className="mt-3.5 w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      >
                        <span>View Complete Travel Ledger</span>
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2 text-xs text-slate-600 dark:text-slate-400">
                  No employee profile directly matches this name or ID. Showing filtered aggregate metrics and records matching &ldquo;{debouncedSearch}&rdquo; below.
                </div>
              )}
            </div>
          )}

          {/* Executive KPI Overview Cards: 3-Tier Spend Hierarchy */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* 1. Net Corporate Spend */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/80 p-4 rounded-xl shadow-xs relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full pointer-events-none" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                Net Corporate Spend
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.netCorporateSpend ?? overview.totalSpend)}
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">
                Gross ({formatShortINR(overview.grossBilledSpend ?? overview.totalSpend)}) − Credits ({formatShortINR(overview.creditNoteReversals ?? 0)})
              </span>
            </div>

            {/* 2. Gross Billed Spend */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Gross Billed Spend
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.grossBilledSpend ?? overview.totalSpend)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                Authoritative invoices & tickets
              </span>
            </div>

            {/* 3. Credit Note Reversals */}
            <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
                Credit Reversals / Refunds
              </span>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                -{formatINR(overview.creditNoteReversals ?? 0)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                {overview.creditNoteCount ?? creditNotes?.totalCreditNotes ?? 0} credit notes reconciled
              </span>
            </div>

            {/* 4. Total Trips & Transit Legs */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Total Trips & Sectors
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {overview.totalTrips.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                {overview.zeroFareTransitLegsCount ?? 0} zero-fare transit legs tracked
              </span>
            </div>

            {/* 5. Cost Centers & Projects */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Active Projects
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {(overview.activeProjectsCount ?? projects.length).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                Matrix allocations reconciled
              </span>
            </div>

            {/* 6. Avg per Trip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Avg Spend / Trip
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.avgSpendPerTrip)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
                Avg {formatINR(overview.avgSpendPerTraveler)} / employee
              </span>
            </div>
          </div>

          {/* Traceability & Compliance Bar */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between text-xs text-slate-600 dark:text-slate-400 gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              <span>
                <strong>Data Traceability:</strong> Evaluated {overview.dataTraceability.totalRecordsEvaluated} imported historical records from PostgreSQL database. {overview.dataTraceability.recordsWithCost} trips with confirmed monetary fare, {overview.zeroFareTransitLegsCount ?? 0} zero-fare connecting transit legs preserved without fare inflation.
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              Currency: INR (₹)
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto">
            {[
              { id: "overview", label: "Executive Overview", icon: <BarChart3 size={15} /> },
              { id: "projects", label: `Project Intelligence (${projects.length})`, icon: <Briefcase size={15} /> },
              { id: "modal-split", label: `Modal Split (${modalSplit?.categories.length ?? 0})`, icon: <Layers size={15} /> },
              { id: "credit-notes", label: `Credit Notes & Refunds (${creditNotes?.totalCreditNotes ?? 0})`, icon: <RotateCcw size={15} /> },
              { id: "journeys", label: `Multi-Leg Journeys (${journeys.length})`, icon: <Plane size={15} /> },
              { id: "employees", label: `Employee Analysis (${employees.length})`, icon: <UsersRound size={15} /> },
              { id: "departments", label: `Department Spend (${departments.length})`, icon: <Building2 size={15} /> },
              { id: "destinations", label: `Destinations & Routes (${destinations?.topDestinations.length || 0})`, icon: <Compass size={15} /> },
              { id: "vendors", label: `Carriers & Vendors (${vendors.length})`, icon: <Plane size={15} /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === t.id
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Month-on-Month Expenditure Trend Chart */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      HISTORICAL EXPENDITURE TIMELINE
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Month-on-Month Travel Spend
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {overview.monthOnMonthSpend.length} recorded months
                  </span>
                </div>

                {overview.monthOnMonthSpend.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No monthly trend data available for selected filter period.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Visual Bar Graph */}
                    <div className="h-48 flex items-end gap-2 pt-6 pb-2 px-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
                      {overview.monthOnMonthSpend.map((m) => {
                        const heightPercent = Math.max(8, Math.round((m.totalSpend / maxMonthlySpend) * 100));
                        return (
                          <div key={m.monthKey} className="flex-1 min-w-[42px] max-w-[70px] flex flex-col items-center gap-1 group relative">
                            {/* Hover Tooltip */}
                            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 dark:bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md shadow-lg pointer-events-none whitespace-nowrap z-10 border border-slate-700">
                              <div><strong>{m.monthLabel}</strong></div>
                              <div>{formatINR(m.totalSpend)} ({m.tripCount} trips)</div>
                            </div>
                            {/* Bar */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full bg-emerald-500/80 hover:bg-emerald-500 dark:bg-emerald-600/80 dark:hover:bg-emerald-500 rounded-t-md transition-all shadow-xs"
                            />
                            {/* Label */}
                            <span className="text-[9.5px] font-medium text-slate-500 dark:text-slate-400 truncate w-full text-center">
                              {m.monthLabel.split(" ")[0]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Two Column Section: FY Breakdown & Top Spenders */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Spend by Financial Year */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        FISCAL INTELLIGENCE
                      </span>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        Spend by Financial Year (Apr – Mar)
                      </h2>
                    </div>
                    <span className="text-xs text-slate-400">Indian Corporate Fiscal Calendar</span>
                  </div>

                  {overview.spendByFinancialYear.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No financial year data found.</div>
                  ) : (
                    <div className="space-y-3">
                      {overview.spendByFinancialYear.map((fy) => (
                        <div key={fy.financialYear} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                              {fy.financialYear}
                            </strong>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {fy.tripCount} trips · {fy.travelerCount} active travelers
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block font-mono">
                              {formatINR(fy.totalSpend)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Avg {formatINR(fy.tripCount > 0 ? fy.totalSpend / fy.tripCount : 0)} / trip
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Domestic vs International Travel */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        GEOGRAPHIC DISTRIBUTION
                      </span>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        Domestic vs. International Movement
                      </h2>
                    </div>
                    <Globe size={16} className="text-emerald-500" />
                  </div>

                  {destinations && (
                    <div className="space-y-4">
                      {/* Domestic Card */}
                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                            DOM
                          </div>
                          <div>
                            <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                              Domestic Corporate Travel
                            </strong>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {destinations.domesticTrips} flights/trains within India
                            </span>
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {formatINR(destinations.domesticSpend)}
                        </div>
                      </div>

                      {/* International Card */}
                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                            INTL
                          </div>
                          <div>
                            <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                              Cross-Border International Travel
                            </strong>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {destinations.internationalTrips} overseas sectors (DXB, SIN, LHR, etc.)
                            </span>
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {formatINR(destinations.internationalSpend)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PROJECT INTELLIGENCE */}
          {activeTab === "projects" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      COST CENTER & PROJECT ALLOCATION INTELLIGENCE
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Project-Wise Corporate Mobility Ledger
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Relational child table allocations preserving one original billing transaction with multiple project cost shares.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Total Project Spend</span>
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatINR(projects.reduce((acc, p) => acc + (p.netSpend ?? p.totalSpend ?? 0), 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {projects.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No project allocations found for the active filter period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/40">
                          <th className="py-3 px-3">Project Code & Name</th>
                          <th className="py-3 px-3">Location / Client</th>
                          <th className="py-3 px-3 text-center">Allocations</th>
                          <th className="py-3 px-3 text-center">Travelers</th>
                          <th className="py-3 px-3">Top Routes</th>
                          <th className="py-3 px-3 text-right">Gross Billed</th>
                          <th className="py-3 px-3 text-right">Credit Notes</th>
                          <th className="py-3 px-3 text-right">Net Spend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {projects.map((proj) => (
                          <tr key={proj.projectCode} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px] shrink-0 border border-emerald-200 dark:border-emerald-800/80">
                                  <Briefcase size={13} />
                                </span>
                                <div>
                                  <span className="font-bold text-slate-900 dark:text-white block">
                                    {proj.projectName}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                                    {proj.projectCode}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-slate-700 dark:text-slate-300 block">
                                {proj.location || "Corporate"}
                              </span>
                              {proj.clientName && (
                                <span className="text-[10.5px] text-slate-400 block">
                                  Client: {proj.clientName}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {proj.allocationCount}
                            </td>
                            <td className="py-3 px-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {proj.travelerCount}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {proj.topRoutes && proj.topRoutes.length > 0 ? (
                                  proj.topRoutes.slice(0, 2).map((r, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                      {r}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-400 text-[11px]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                              {formatINR(proj.grossSpend ?? proj.totalSpend)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                              {proj.creditSpend > 0 ? `-${formatINR(proj.creditSpend)}` : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {formatINR(proj.netSpend ?? proj.totalSpend)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MODAL SPLIT */}
          {activeTab === "modal-split" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      MOBILITY SEGREGATION & FLEET ALLOCATION
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Corporate Travel Modal Split
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Segregating Air Mobility (Domestic & International) from Non-Air Corporate Services (Hotels, Buses, and Visas).
                    </p>
                  </div>
                  {modalSplit && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Total Spend</span>
                        <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatINR(modalSplit.totalSpend)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {modalSplit && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {modalSplit.categories.map((cat) => (
                      <div key={cat.category} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{cat.label}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            cat.isNonFlight
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                          }`}>
                            {cat.isNonFlight ? "Non-Flight" : "Aviation"}
                          </span>
                        </div>
                        <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                          {formatINR(cat.totalCost)}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                          <span>{cat.recordCount} bookings</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {cat.shareOfSpendPct.toFixed(1)}% of total
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cat.isNonFlight ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, Math.max(2, cat.shareOfSpendPct))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Non-flight Callout */}
                {modalSplit && modalSplit.nonFlightRecords > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                        <Building2 size={16} />
                      </span>
                      <div>
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                          Non-Flight Corporate Services Segregated
                        </span>
                        <span className="text-[11px] text-amber-700 dark:text-amber-300 block">
                          {modalSplit.nonFlightRecords} bookings in Hotels, Bus transit, and Visas cleanly tracked without distorting flight fare averages.
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono text-amber-800 dark:text-amber-200 whitespace-nowrap">
                      {formatINR(modalSplit.nonFlightSpend)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CREDIT NOTES & REFUNDS */}
          {activeTab === "credit-notes" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      REFUND & CANCELLATION RECONCILIATION
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Credit Notes & Reversal Ledger
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Full audit trail of negative billing line items and refunds reconciled against original flight tickets.
                    </p>
                  </div>
                  {creditNotes && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Total Credit Reversals</span>
                        <span className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
                          -{formatINR(creditNotes.totalReversedAmount)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {!creditNotes || creditNotes.creditNotes.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No credit notes or reversals recorded for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/40">
                          <th className="py-3 px-3">Date</th>
                          <th className="py-3 px-3">Passenger & Employee</th>
                          <th className="py-3 px-3">Credit Note / Ticket</th>
                          <th className="py-3 px-3">Original Ticket Reference</th>
                          <th className="py-3 px-3">Carrier / Airline</th>
                          <th className="py-3 px-3">Sector</th>
                          <th className="py-3 px-3 text-right">Reversal Amount</th>
                          <th className="py-3 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {creditNotes.creditNotes.map((cn) => (
                          <tr key={cn.recordId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                              {cn.travelDate || cn.bookingDate || "—"}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {cn.passengerName}
                              </span>
                              <span className="text-[10.5px] font-mono text-slate-500">
                                {cn.employeeIdentifier || "—"}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono text-amber-700 dark:text-amber-400 font-semibold">
                              {cn.ticketNumber || `REC-${cn.recordId}`}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-500">
                              {cn.originalTicketNumber || "—"}
                            </td>
                            <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                              {cn.vendor || "—"}
                            </td>
                            <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                              {cn.sector || "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                              -{formatINR(cn.reversalAmount)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                                <ShieldCheck size={11} />
                                Reconciled
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MULTI-LEG JOURNEYS */}
          {activeTab === "journeys" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      ITINERARY AGGREGATION & ROUTE VISIBILITY
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Multi-Leg Journey Reconstruction
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Connecting legs aggregated into complete origin-to-destination itineraries while preserving zero-fare transit visibility.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10.5px] uppercase font-bold text-slate-400 block">Total Journeys</span>
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {journeys.length}
                      </span>
                    </div>
                  </div>
                </div>

                {journeys.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No reconstructed journeys found for this period.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {journeys.map((jrn) => {
                      const isExpanded = expandedJourneyId === jrn.journeyId;
                      return (
                        <div
                          key={jrn.journeyId}
                          className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/40 hover:border-emerald-300 dark:hover:border-emerald-800 transition-all"
                        >
                          <div
                            onClick={() => setExpandedJourneyId(isExpanded ? null : jrn.journeyId)}
                            className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
                                <Plane size={16} />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                                    {jrn.routeLabel}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                    {jrn.journeyType}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                                  Passenger: <strong className="text-slate-700 dark:text-slate-200">{jrn.passengerName}</strong> · {jrn.totalLegs} Leg{jrn.totalLegs > 1 ? "s" : ""}
                                  {jrn.zeroFareLegs > 0 && ` (${jrn.zeroFareLegs} zero-fare transit)`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white block">
                                  {formatINR(jrn.totalCost)}
                                </span>
                                <span className="text-[10.5px] text-slate-400 block">
                                  {jrn.startDate || "—"} {jrn.endDate && jrn.endDate !== jrn.startDate ? `→ ${jrn.endDate}` : ""}
                                </span>
                              </div>
                              <span className="text-slate-400">
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </span>
                            </div>
                          </div>

                          {/* Expanded Legs Table */}
                          {isExpanded && jrn.legs && jrn.legs.length > 0 && (
                            <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                                    <th className="py-2 px-2">Leg #</th>
                                    <th className="py-2 px-2">Date</th>
                                    <th className="py-2 px-2">Sector</th>
                                    <th className="py-2 px-2">Carrier</th>
                                    <th className="py-2 px-2">Ticket Ref</th>
                                    <th className="py-2 px-2 text-right">Fare</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {jrn.legs.map((leg) => (
                                    <tr key={leg.recordId}>
                                      <td className="py-2 px-2 font-mono font-bold text-slate-500">
                                        Leg {leg.legSequence}
                                      </td>
                                      <td className="py-2 px-2 font-mono text-slate-600 dark:text-slate-300">
                                        {leg.travelDate || "—"}
                                      </td>
                                      <td className="py-2 px-2 font-semibold text-slate-900 dark:text-white">
                                        {leg.fromLocation} → {leg.toLocation}
                                      </td>
                                      <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                                        {leg.carrier || "—"}
                                      </td>
                                      <td className="py-2 px-2 font-mono text-[11px] text-slate-500">
                                        {leg.ticketNumber || `REC-${leg.recordId}`}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-bold">
                                        {leg.isZeroFare ? (
                                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]">
                                            ₹0.00 (Transit Leg)
                                          </span>
                                        ) : (
                                          <span className="text-slate-900 dark:text-white">
                                            {formatINR(leg.cost)}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEE TRAVEL ANALYSIS */}
          {activeTab === "employees" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Employee Travel & Expenditure Leaderboard
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click any employee to inspect their individual chronological trip ledger, route history, and lifetime spend.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExport("EMPLOYEES")}
                  className="button button-ghost text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Export Employees (CSV)</span>
                </button>
              </div>

              {filteredEmployees.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No employee travel records match your current filters.
                </div>
              ) : (
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Employee ID</th>
                        <th>Department</th>
                        <th className="text-right">Total Trips</th>
                        <th className="text-right">Total Spend</th>
                        <th className="text-right">Avg / Trip</th>
                        <th>Top Destination</th>
                        <th>Activity Span</th>
                        <th className="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEmployees.map((emp) => (
                        <tr
                          key={emp.employeeIdentifier}
                          onClick={() => openEmployeeDetail(emp.employeeIdentifier)}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="avatar avatar-tiny">
                                {getInitials(emp.employeeName)}
                              </span>
                              <strong className="text-xs font-bold text-slate-900 dark:text-white">
                                {emp.employeeName}
                              </strong>
                            </div>
                          </td>
                          <td>
                            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/50">
                              {emp.employeeIdentifier}
                            </span>
                          </td>
                          <td className="text-xs text-slate-600 dark:text-slate-300">
                            {emp.department || "General"}
                          </td>
                          <td className="text-right text-xs font-semibold text-slate-900 dark:text-white">
                            {emp.tripCount}
                          </td>
                          <td className="text-right text-xs font-bold font-mono text-slate-900 dark:text-white">
                            {formatINR(emp.totalSpend)}
                          </td>
                          <td className="text-right text-xs text-slate-600 dark:text-slate-400 font-mono">
                            {formatINR(emp.avgSpendPerTrip)}
                          </td>
                          <td className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {emp.topDestination}
                          </td>
                          <td className="text-xs text-slate-500 dark:text-slate-400">
                            {emp.firstTripDate ? `${emp.firstTripDate} → ${emp.lastTripDate || "now"}` : "—"}
                          </td>
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEmployeeDetail(emp.employeeIdentifier)}
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold flex items-center gap-1 mx-auto px-2.5 py-1 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                            >
                              <span>View Ledger</span>
                              <ArrowUpRight size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalEmployeePages > 1 && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Showing {employeePage * pageSize + 1} to {Math.min((employeePage + 1) * pageSize, filteredEmployees.length)} of {filteredEmployees.length} travelers
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={employeePage === 0}
                      onClick={() => setEmployeePage((p) => p - 1)}
                      className="button button-ghost py-1 px-2.5 disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={employeePage >= totalEmployeePages - 1}
                      onClick={() => setEmployeePage((p) => p + 1)}
                      className="button button-ghost py-1 px-2.5 disabled:opacity-40"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEPARTMENT BREAKDOWN */}
          {activeTab === "departments" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Department-wise Travel Budget Distribution
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cumulative departmental spend, traveling personnel, and budget percentage allocation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExport("DEPARTMENTS")}
                  className="button button-ghost text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Export Departments (CSV)</span>
                </button>
              </div>

              {departments.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No department breakdown available.
                </div>
              ) : (
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th className="text-right">Total Spend</th>
                        <th className="text-right">Traveling Staff</th>
                        <th className="text-right">Total Trips</th>
                        <th className="text-right">Avg / Employee</th>
                        <th className="w-1/4">Budget Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dept) => (
                        <tr key={dept.department}>
                          <td className="font-bold text-xs text-slate-900 dark:text-white">
                            {dept.department}
                          </td>
                          <td className="text-right text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {formatINR(dept.totalSpend)}
                          </td>
                          <td className="text-right text-xs text-slate-700 dark:text-slate-300">
                            {dept.employeeCount}
                          </td>
                          <td className="text-right text-xs text-slate-700 dark:text-slate-300">
                            {dept.tripCount}
                          </td>
                          <td className="text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                            {formatINR(dept.avgSpendPerEmployee)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(100, dept.shareOfTotalSpend)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 shrink-0 w-12 text-right">
                                {dept.shareOfTotalSpend}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DESTINATIONS & ROUTES */}
          {activeTab === "destinations" && destinations && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Destinations */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      DESTINATION LEADERBOARD
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Top Visited Cities & Sites
                    </h2>
                  </div>
                  <Compass size={16} className="text-emerald-500" />
                </div>

                <div className="space-y-2.5">
                  {destinations.topDestinations.map((d, idx) => (
                    <div key={d.destination} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                            {d.destination}
                          </strong>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {d.tripCount} completed visits
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-white block">
                          {formatINR(d.totalSpend)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Avg {formatINR(d.avgCost)} / trip
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Routes */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      ROUTE EFFICIENCY
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Top Corporate Travel Corridors
                    </h2>
                  </div>
                  <Plane size={16} className="text-emerald-500" />
                </div>

                <div className="space-y-2.5">
                  {destinations.topRoutes.map((r, idx) => (
                    <div key={r.routeLabel} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                            {r.origin} <span className="text-emerald-500">→</span> {r.destination}
                          </strong>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {r.tripCount} movements
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-white block">
                          {formatINR(r.totalSpend)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Avg {formatINR(r.avgCost)} / ticket
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: VENDORS & CARRIERS */}
          {activeTab === "vendors" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Carrier & Vendor Spend Distribution
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Airlines, train agencies, and hotel suppliers handling corporate mobility bookings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExport("VENDORS")}
                  className="button button-ghost text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Export Vendors (CSV)</span>
                </button>
              </div>

              {vendors.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No vendor data recorded.
                </div>
              ) : (
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Carrier / Vendor</th>
                        <th className="text-right">Total Spend</th>
                        <th className="text-right">Bookings</th>
                        <th className="text-right">Avg Booking Value</th>
                        <th>Travel Modes</th>
                        <th className="w-1/4">Share of Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((v) => (
                        <tr key={v.provider}>
                          <td className="font-bold text-xs text-slate-900 dark:text-white">
                            {v.provider}
                          </td>
                          <td className="text-right text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {formatINR(v.totalSpend)}
                          </td>
                          <td className="text-right text-xs text-slate-700 dark:text-slate-300">
                            {v.bookingCount}
                          </td>
                          <td className="text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                            {formatINR(v.avgBookingValue)}
                          </td>
                          <td className="text-xs text-slate-500">
                            {v.travelModes.join(", ") || "FLIGHT"}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(100, v.shareOfSpend)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 shrink-0 w-12 text-right">
                                {v.shareOfSpend}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* DETAILED EMPLOYEE TRAVEL HISTORY MODAL */}
      {selectedEmployeeId && (
        <ModalPortal><div
          className="fixed inset-0 flex items-center justify-center p-3 sm:p-6"
          style={{
            zIndex: 99999,
            backgroundColor: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(6px)",
          }}
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedEmployeeId(null);
              setEmployeeDetail(null);
            }
          }}
        >
          <div
            className="relative w-full rounded-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white"
            style={{
              width: "min(1080px, 96vw)",
              maxWidth: "1080px",
              maxHeight: "92vh",
              backgroundColor: "var(--surface, #ffffff)",
              border: "1px solid var(--line, #e2e8f0)",
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.4)",
            }}
          >
            <button
              type="button"
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors z-20 cursor-pointer"
              onClick={() => {
                setSelectedEmployeeId(null);
                setEmployeeDetail(null);
              }}
              title="Close travel ledger"
            >
              <X size={18} />
            </button>

            {detailLoading || !employeeDetail ? (
              <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
                <Clock3 size={24} className="animate-spin text-emerald-500" />
                <span className="font-medium text-sm">
                  Loading comprehensive travel ledger for <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{selectedEmployeeId}</strong>…
                </span>
              </div>
            ) : (
              <div className="flex flex-col h-full max-h-[92vh] overflow-hidden">
                {/* Header Banner */}
                <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800/60">
                      EMPLOYEE TRAVEL LEDGER & EXPENSE AUDIT
                    </span>
                    <span className="text-xs text-slate-400">
                      Verified Historical Mobility Records
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <span className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-bold text-lg flex items-center justify-center shadow-sm shrink-0">
                        {getInitials(employeeDetail.employeeName)}
                      </span>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                          {employeeDetail.employeeName}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                            {employeeDetail.employeeIdentifier}
                          </span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            {employeeDetail.department || "General"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pr-8 sm:pr-0">
                      <div className="text-right">
                        <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">
                          Lifetime Travel Spend
                        </span>
                        <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatINR(employeeDetail.lifetimeSpend)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs shrink-0">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 text-[10.5px] uppercase font-bold block mb-1">Total Completed Trips</span>
                    <strong className="text-base font-bold text-slate-900 dark:text-white">{employeeDetail.lifetimeTrips} trips</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 text-[10.5px] uppercase font-bold block mb-1">Average Cost / Trip</span>
                    <strong className="text-base font-bold font-mono text-slate-900 dark:text-white">{formatINR(employeeDetail.averageTripCost)}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 text-[10.5px] uppercase font-bold block mb-1">Primary Destination</span>
                    <strong className="text-base font-bold text-slate-900 dark:text-white truncate block">{employeeDetail.topDestination || "—"}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 text-[10.5px] uppercase font-bold block mb-1">Travel Span</span>
                    <strong className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                      {employeeDetail.firstTripDate ? `${employeeDetail.firstTripDate} → ${employeeDetail.lastTripDate || "now"}` : "—"}
                    </strong>
                  </div>
                </div>

                {/* Chronological Table Section */}
                <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between shrink-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Clock3 size={14} className="text-emerald-500" />
                      <span>Chronological Travel Ledger ({employeeDetail.trips.length} records)</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Sorted chronologically by travel date
                    </span>
                  </div>

                  <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 shadow-xs z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">#</th>
                          <th className="py-2.5 px-3 min-w-[100px]">Date</th>
                          <th className="py-2.5 px-3 min-w-[200px]">Sector / Route</th>
                          <th className="py-2.5 px-3 min-w-[120px]">Ticket / PNR</th>
                          <th className="py-2.5 px-3 min-w-[110px]">Carrier</th>
                          <th className="py-2.5 px-3 min-w-[90px]">Mode</th>
                          <th className="py-2.5 px-3 min-w-[120px]">Project</th>
                          <th className="py-2.5 px-3 min-w-[110px] text-right">Fare Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {employeeDetail.trips.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400">
                              No historical travel trips recorded for this employee.
                            </td>
                          </tr>
                        ) : (
                          employeeDetail.trips.map((t, idx) => (
                            <tr
                              key={t.id || idx}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                {t.travelDate || "—"}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                                  <span>{t.fromLocation || "—"}</span>
                                  <span className="text-emerald-500 font-bold">→</span>
                                  <span>{t.toLocation || "—"}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                  {t.ticketReference || "—"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                                {t.provider || "—"}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                                  t.travelMode?.toUpperCase() === "TRAIN"
                                    ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                    : t.travelMode?.toUpperCase() === "CAB"
                                    ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                                    : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                }`}>
                                  {t.travelMode || "FLIGHT"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[140px]" title={t.projectName || ""}>
                                {t.projectName || "General"}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                {t.cost != null ? formatINR(t.cost) : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Bar */}
                <div className="p-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between shrink-0">
                  <div className="text-xs text-slate-500">
                    Showing {employeeDetail.trips.length} verified trip records · Total: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatINR(employeeDetail.lifetimeSpend)}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={13} />
                      <span>Print Ledger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeId(null);
                        setEmployeeDetail(null);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

