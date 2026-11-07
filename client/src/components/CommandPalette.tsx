import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useLocation } from "wouter";
import {
  BarChart3,
  CalendarDays,
  Compass,
  FileCheck2,
  FileText,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  TicketCheck,
  UserRound,
  WalletCards,
  X,
  Sparkles,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { AuthUser, Role } from "../lib/api";
import { isSupabaseEnabled } from "../lib/supabase";
import { listEmployees, type EmployeeSummary } from "../lib/data/travel";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  onLogout: () => void;
}

export function CommandPalette({ open, onOpenChange, user, onLogout }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const role: Role = user.role;
  const canFindPeople = isSupabaseEnabled && (["ADMIN", "COMPANY_ADMIN", "TRAVEL_DESK"] as Role[]).includes(role);
  const [term, setTerm] = useState("");
  const [people, setPeople] = useState<EmployeeSummary[]>([]);

  // Find employees by name or ID as the CEO / Admin types.
  useEffect(() => {
    if (!open || !canFindPeople || term.trim().length < 2) { setPeople([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      listEmployees({ q: term.trim(), limit: 8 }).then((r) => { if (alive) setPeople(r.rows); }).catch(() => { if (alive) setPeople([]); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [term, open, canFindPeople]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const navigate = (path: string) => {
    setLocation(path);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-[#E4E7EC] dark:border-[#1E293B] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Trapple Command Palette" className="w-full">
          <div className="flex items-center px-4 border-b border-[#E4E7EC] dark:border-[#1E293B] gap-3">
            <Search size={18} className="text-[#94A3B8] shrink-0" />
            <Command.Input
              autoFocus
              value={term}
              onValueChange={setTerm}
              placeholder={canFindPeople ? "Search an employee by name or ID, or a page… (Esc to close)" : "Type a command or search actions… (Esc to close)"}
              className="w-full py-4 bg-transparent outline-none text-[15px] text-[#10243A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8]"
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-lg text-[#94A3B8] hover:text-[#10243A] dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-8 text-center text-sm text-[#94A3B8]">
              No matching actions or pages found.
            </Command.Empty>

            {people.length > 0 && (
              <Command.Group
                heading="Employees"
                className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#F28C28]"
              >
                {people.map((p) => (
                  <Command.Item
                    key={p.employee_id}
                    value={`${p.employee_name} ${p.employee_code} ${p.department ?? ""} ${p.employee_id}`}
                    onSelect={() => navigate(`/travel/employees/${p.employee_id}`)}
                    className="normal-case tracking-normal font-normal flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <UserRound size={16} className="text-[#F28C28]" />
                    <span className="font-semibold">{p.employee_name}</span>
                    <span className="text-xs text-[#94A3B8]">{p.employee_code}{p.department ? ` · ${p.department}` : ""}{p.active ? "" : " · past"}</span>
                    <span className="ml-auto text-xs text-[#94A3B8]">{p.total_trips} trips · ₹{Number(p.total_spend).toLocaleString("en-IN")}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Actions */}
            <Command.Group
              heading="Quick Actions"
              className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#F28C28]"
            >
              <Command.Item
                onSelect={() => {
                  window.dispatchEvent(new CustomEvent("open-trapple-ai"));
                  onOpenChange(false);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#101828] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
              >
                <Sparkles size={16} className="text-[#14B8A6]" />
                <span>Ask Trapple AI Assistant</span>
                <span className="ml-auto text-xs text-[#94A3B8]">AI Chat</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  toggleTheme();
                  onOpenChange(false);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
              >
                {theme === "light" ? <Moon size={16} className="text-[#F28C28]" /> : <Sun size={16} className="text-[#F28C28]" />}
                <span>Toggle theme ({theme === "light" ? "Dark mode" : "Light mode"})</span>
                <span className="ml-auto text-xs text-[#94A3B8]">Cmd+Shift+T</span>
              </Command.Item>

              {role === "EMPLOYEE" && (
                <>
                  <Command.Item
                    onSelect={() => navigate("/employee/plan-trip")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <Plus size={16} className="text-[#F28C28]" />
                    <span>Plan a new travel request</span>
                    <span className="ml-auto text-xs text-[#94A3B8]">New request</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/expenses")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <WalletCards size={16} className="text-[#F28C28]" />
                    <span>Log travel expense / claim</span>
                    <span className="ml-auto text-xs text-[#94A3B8]">Receipts</span>
                  </Command.Item>
                </>
              )}
            </Command.Group>

            {/* Navigation by Role */}
            <Command.Group
              heading="Workspace Navigation"
              className="px-2 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]"
            >
              {role === "EMPLOYEE" && (
                <>
                  <Command.Item
                    onSelect={() => navigate("/employee")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <Sparkles size={16} className="text-[#F28C28]" />
                    <span>Employee Dashboard Overview</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/journeys")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <Compass size={16} className="text-[#F28C28]" />
                    <span>My Journeys</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/calendar")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <CalendarDays size={16} className="text-[#F28C28]" />
                    <span>Travel Calendar Schedule</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/expenses")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <WalletCards size={16} className="text-[#F28C28]" />
                    <span>Expense Tracker & Receipts</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/profile")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <UserRound size={16} className="text-[#F28C28]" />
                    <span>Travel Profile & Preferences</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/employee/reports")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <BarChart3 size={16} className="text-[#F28C28]" />
                    <span>Travel Reports & Destination Insights</span>
                  </Command.Item>
                </>
              )}

              {role === "APPROVER" && (
                <>
                  <Command.Item
                    onSelect={() => navigate("/approver")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <FileCheck2 size={16} className="text-[#F28C28]" />
                    <span>Approval Queue</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/approver/history")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <FileText size={16} className="text-[#F28C28]" />
                    <span>Approval Decision History</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/approver/reports")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <BarChart3 size={16} className="text-[#F28C28]" />
                    <span>Team Travel Reports & Extraction</span>
                  </Command.Item>
                </>
              )}

              {role === "TRAVEL_DESK" && (
                <>
                  <Command.Item
                    onSelect={() => navigate("/travel-desk")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <TicketCheck size={16} className="text-[#F28C28]" />
                    <span>Operations Overview</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/travel-desk/bookings")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <TicketCheck size={16} className="text-[#F28C28]" />
                    <span>Booking Queue</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/travel-desk/reports")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <BarChart3 size={16} className="text-[#F28C28]" />
                    <span>Desk Bookings & Vendor Report</span>
                  </Command.Item>
                </>
              )}

              {role === "ADMIN" && (
                <>
                  <Command.Item
                    onSelect={() => navigate("/admin")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <Settings2 size={16} className="text-[#F28C28]" />
                    <span>Admin Control Center</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/admin/requests")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <FileText size={16} className="text-[#F28C28]" />
                    <span>All Travel Requests</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/admin/bookings")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <TicketCheck size={16} className="text-[#F28C28]" />
                    <span>All Bookings & Spend</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => navigate("/admin/reports")}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-[#10243A] dark:text-[#E2E8F0] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
                  >
                    <BarChart3 size={16} className="text-[#F28C28]" />
                    <span>Organization Analytics</span>
                  </Command.Item>
                </>
              )}
            </Command.Group>

            {/* Account */}
            <Command.Group
              heading="Session"
              className="px-2 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]"
            >
              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onLogout();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <LogOut size={16} />
                <span>Sign out of Trapple</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#E4E7EC] dark:border-[#1E293B] text-xs text-[#667085] dark:text-[#94A3B8] bg-[#F8FAFC] dark:bg-[#0F172A]">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-[#E4E7EC] dark:bg-[#1E293B] text-[10px] font-mono text-[#475467] dark:text-[#CBD5E1]">↑↓</span>
              <span>Navigate</span>
              <span className="px-1.5 py-0.5 rounded bg-[#E4E7EC] dark:bg-[#1E293B] text-[10px] font-mono text-[#475467] dark:text-[#CBD5E1]">↵</span>
              <span>Select</span>
              <span className="px-1.5 py-0.5 rounded bg-[#E4E7EC] dark:bg-[#1E293B] text-[10px] font-mono text-[#475467] dark:text-[#CBD5E1]">esc</span>
              <span>Close</span>
            </div>
            <span>Trapple Quick Assist</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
