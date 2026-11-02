import { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart3,
  TrendingUp,
  Download,
  Search,
  Filter,
  Calendar,
  Layers,
  UsersRound,
  Plane,
  Building2,
  CalendarDays,
  RotateCcw,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Printer,
  X,
  FileSpreadsheet,
  Globe,
  Tag,
  CheckCircle2,
  FileText,
  DollarSign,
  Briefcase,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
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
  const [activeTab, setActiveTab] = useState<"overview" | "employees" | "departments" | "destinations" | "vendors">("overview");

  // Filters state
  const [period, setPeriod] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

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

  // Detailed employee modal state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetailedHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Pagination for employee table
  const [employeePage, setEmployeePage] = useState<number>(0);
  const pageSize = 15;

  // Build filter params object
  const currentFilter = useMemo<SpendFilterParams>(() => {
    return {
      period: period !== "ALL" && period !== "CUSTOM" ? period : undefined,
      search: search.trim() || undefined,
      department: selectedDept || undefined,
      provider: selectedProvider || undefined,
      fromDate: period === "CUSTOM" && fromDate ? fromDate : undefined,
      toDate: period === "CUSTOM" && toDate ? toDate : undefined,
    };
  }, [period, search, selectedDept, selectedProvider, fromDate, toDate]);

  // Load filter dropdown options once on mount
  useEffect(() => {
    spendReportsApi.getFilterDepartments().then(setDepartmentOptions).catch(() => {});
    spendReportsApi.getFilterProviders().then(setProviderOptions).catch(() => {});
  }, []);

  // Fetch report data whenever filters change
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, emp, dept, dest, vend] = await Promise.all([
        spendReportsApi.getOverview(currentFilter),
        spendReportsApi.getEmployees(currentFilter),
        spendReportsApi.getDepartments(currentFilter),
        spendReportsApi.getDestinations(currentFilter),
        spendReportsApi.getVendors(currentFilter),
      ]);
      setOverview(ov);
      setEmployees(emp);
      setDepartments(dept);
      setDestinations(dest);
      setVendors(vend);
    } catch (err: any) {
      setError(err?.message || "Failed to load corporate spend intelligence reports.");
    } finally {
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
        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
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
          {/* Executive KPI Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* Total Spend */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Total Spend
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.totalSpend)}
              </div>
              <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">
                Authoritative imported spend
              </span>
            </div>

            {/* Total Trips */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Total Trips
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {overview.totalTrips.toLocaleString()}
              </div>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-1">
                {overview.dataTraceability.recordsWithCost} with fare cost recorded
              </span>
            </div>

            {/* Travelers */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Unique Travelers
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {overview.travelerCount.toLocaleString()}
              </div>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-1">
                Distinct employee records
              </span>
            </div>

            {/* Avg per Trip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Avg Spend / Trip
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.avgSpendPerTrip)}
              </div>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-1">
                Per completed historical journey
              </span>
            </div>

            {/* Avg per Traveler */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Avg / Employee
              </span>
              <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {formatINR(overview.avgSpendPerTraveler)}
              </div>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-1">
                Cumulative per traveling staff
              </span>
            </div>

            {/* Top Spender */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                Top Spender
              </span>
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={overview.highestSpendingEmployee?.employeeName || "—"}>
                {overview.highestSpendingEmployee?.employeeName || "—"}
              </div>
              <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-1">
                {formatShortINR(overview.highestSpendingEmployee?.totalSpend || 0)} ({overview.highestSpendingEmployee?.tripCount || 0} trips)
              </span>
            </div>
          </div>

          {/* Traceability & Compliance Bar */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between text-xs text-slate-600 dark:text-slate-400 gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              <span>
                <strong>Data Traceability:</strong> Evaluated {overview.dataTraceability.totalRecordsEvaluated} imported historical records from PostgreSQL database. {overview.dataTraceability.recordsWithCost} trips with confirmed monetary fare, {overview.dataTraceability.recordsWithoutCost} trips excluded from financial totals due to unrecorded cost.
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
              { id: "employees", label: `Employee Analysis (${employees.length})`, icon: <UsersRound size={15} /> },
              { id: "departments", label: `Department Spend (${departments.length})`, icon: <Building2 size={15} /> },
              { id: "destinations", label: `Destinations & Routes (${destinations?.topDestinations.length || 0})`, icon: <Compass size={15} /> },
              { id: "vendors", label: `Carriers & Vendors (${vendors.length})`, icon: <Plane size={15} /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
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
                          <td className="text-center">
                            <button
                              type="button"
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1 mx-auto"
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
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <button
              type="button"
              className="icon-button dialog-close"
              onClick={() => {
                setSelectedEmployeeId(null);
                setEmployeeDetail(null);
              }}
            >
              <X size={18} />
            </button>

            {detailLoading || !employeeDetail ? (
              <div className="py-20 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Clock3 size={18} className="animate-spin text-emerald-500" />
                <span>Loading complete travel ledger for {selectedEmployeeId}…</span>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Employee Header */}
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                    INDIVIDUAL TRAVEL RECORD & SPEND LEDGER
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
                    <div className="flex items-center gap-3">
                      <span className="avatar avatar-md font-bold text-sm">
                        {getInitials(employeeDetail.employeeName)}
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {employeeDetail.employeeName}
                        </h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {employeeDetail.employeeIdentifier} · {employeeDetail.department}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-lg">
                        Lifetime Spend: {formatINR(employeeDetail.lifetimeSpend)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10.5px] uppercase block">Lifetime Trips</span>
                    <strong className="text-sm font-bold text-slate-900 dark:text-white">{employeeDetail.lifetimeTrips}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10.5px] uppercase block">Avg Trip Cost</span>
                    <strong className="text-sm font-bold text-slate-900 dark:text-white">{formatINR(employeeDetail.averageTripCost)}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10.5px] uppercase block">Top Destination</span>
                    <strong className="text-sm font-bold text-slate-900 dark:text-white truncate block">{employeeDetail.topDestination}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10.5px] uppercase block">First Active Record</span>
                    <strong className="text-sm font-bold text-slate-900 dark:text-white">{employeeDetail.firstTripDate || "—"}</strong>
                  </div>
                </div>

                {/* Chronological Trip Ledger Table */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Chronological Travel History Ledger ({employeeDetail.trips.length} records)
                  </h3>
                  <div className="responsive-table max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table>
                      <thead>
                        <tr>
                          <th>Travel Date</th>
                          <th>Route</th>
                          <th>Ticket / PNR</th>
                          <th>Carrier</th>
                          <th>Mode</th>
                          <th className="text-right">Cost</th>
                          <th>Project</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeDetail.trips.map((t) => (
                          <tr key={t.id}>
                            <td className="text-xs text-slate-900 dark:text-white font-mono">
                              {t.travelDate || "—"}
                            </td>
                            <td className="text-xs">
                              <span className="font-semibold text-slate-900 dark:text-white">{t.fromLocation || "—"}</span>
                              <span className="text-emerald-500 mx-1.5">→</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{t.toLocation || "—"}</span>
                            </td>
                            <td className="text-xs font-mono text-slate-600 dark:text-slate-300">
                              {t.ticketReference || "—"}
                            </td>
                            <td className="text-xs text-slate-600 dark:text-slate-300">
                              {t.provider || "—"}
                            </td>
                            <td className="text-xs text-slate-500">
                              {t.travelMode || "FLIGHT"}
                            </td>
                            <td className="text-right text-xs font-bold font-mono text-slate-900 dark:text-white">
                              {t.cost != null ? formatINR(t.cost) : "—"}
                            </td>
                            <td className="text-xs text-slate-500">
                              {t.projectName || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmployeeId(null);
                      setEmployeeDetail(null);
                    }}
                    className="button button-ghost text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
