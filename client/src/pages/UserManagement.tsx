import { useState, useEffect, useMemo } from "react";
import { UsersRound, UserPlus, Search, Filter, ShieldCheck, CheckCircle2, AlertCircle, Copy, Edit3, UserX, UserCheck, RefreshCw, Clock, KeyRound, Eye, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ModalPortal from "../components/ModalPortal";
import {
  usersApi,
  type AuthUser,
  type Role,
  type ManagedUser,
  type CreateManagedUserPayload,
  type UpdateManagedUserPayload,
  type CreatedUserResult,
} from "@/lib/api";

type UserManagementProps = {
  user: AuthUser;
};

export function UserManagement({ user }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [viewUser, setViewUser] = useState<ManagedUser | null>(null);
  const [confirmStatusUser, setConfirmStatusUser] = useState<ManagedUser | null>(null);
  const [activationResult, setActivationResult] = useState<CreatedUserResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Form submission loading
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>("");

  // Create User form state
  const [createForm, setCreateForm] = useState<CreateManagedUserPayload>({
    name: "",
    email: "",
    employeeId: "",
    department: "",
    designation: "",
    role: "EMPLOYEE",
    active: true,
    managerName: "",
  });

  // Edit User form state
  const [editForm, setEditForm] = useState<UpdateManagedUserPayload>({
    name: "",
    department: "",
    designation: "",
    role: "EMPLOYEE",
  });

  const isTravelDesk = user.role === "TRAVEL_DESK";
  const isAdmin = user.role === "COMPANY_ADMIN" || user.role === "ADMIN" || user.role === "PLATFORM_ADMIN";

  // Allowed roles for creation based on authenticated user's role
  const availableRoles: { value: Role; label: string; description: string }[] = useMemo(() => {
    if (isTravelDesk) {
      return [
        { value: "EMPLOYEE", label: "Employee", description: "Standard corporate travel booking & profile access" },
        { value: "APPROVER", label: "Approver", description: "Departmental manager for travel & expense review" },
      ];
    }
    // Company Admin / Admin
    return [
      { value: "EMPLOYEE", label: "Employee", description: "Standard corporate travel booking & profile access" },
      { value: "APPROVER", label: "Approver", description: "Departmental manager for travel & expense review" },
      { value: "TRAVEL_DESK", label: "Travel Desk", description: "Booking fulfillment & group travel management" },
      { value: "COMPANY_ADMIN", label: "Company Administrator", description: "Full organizational administrative access" },
    ];
  }, [isTravelDesk]);

  // Load users from backend
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await usersApi.list({
        search: search.trim() || undefined,
        role: roleFilter !== "ALL" ? roleFilter : undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load users from backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle Create User Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!createForm.name.trim()) {
      setFormError("Full name is required");
      return;
    }
    if (!createForm.email.trim() || !createForm.email.includes("@")) {
      setFormError("A valid work email address is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await usersApi.create({
        ...createForm,
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        employeeId: createForm.employeeId?.trim() || undefined,
        department: createForm.department?.trim() || undefined,
        designation: createForm.designation?.trim() || undefined,
      });

      toast.success(`Account created for ${res.name || res.username}`);
      setCreateModalOpen(false);
      setActivationResult(res);
      // Reset form
      setCreateForm({
        name: "",
        email: "",
        employeeId: "",
        department: "",
        designation: "",
        role: "EMPLOYEE",
        active: true,
        managerName: "",
      });
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to create user account");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (u: ManagedUser) => {
    setEditUser(u);
    setEditForm({
      name: u.name || "",
      department: u.department || "",
      designation: u.designation || "",
      role: u.role,
    });
    setFormError("");
  };

  // Handle Edit User Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setFormError("");

    setIsSubmitting(true);
    try {
      await usersApi.update(editUser.id, {
        name: editForm.name?.trim(),
        department: editForm.department?.trim(),
        designation: editForm.designation?.trim(),
        role: editForm.role,
      });

      toast.success("User details updated successfully");
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Toggle Status (Activate / Deactivate)
  const handleToggleStatus = async () => {
    if (!confirmStatusUser) return;
    setIsSubmitting(true);
    const nextStatus = !confirmStatusUser.active;
    try {
      await usersApi.updateStatus(confirmStatusUser.id, nextStatus);
      toast.success(
        nextStatus
          ? `Account ${confirmStatusUser.username} reactivated`
          : `Account ${confirmStatusUser.username} deactivated`
      );
      setConfirmStatusUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to update account status");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Resend Activation
  const handleResendActivation = async (u: ManagedUser) => {
    try {
      const res = await usersApi.resendActivation(u.id);
      setActivationResult(res);
      toast.success(`Generated fresh activation link for ${u.username}`);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate activation link");
    }
  };

  // Copy Activation Link
  const copyActivationLink = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success("Activation link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const roleBadgeStyle = (r: Role) => {
    switch (r) {
      case "COMPANY_ADMIN":
      case "ADMIN":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      case "TRAVEL_DESK":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "APPROVER":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "EMPLOYEE":
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="page-stack animate-page space-y-6">
      {/* 1. Header & Actions */}
      <div className="page-heading flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[#F2A93B]">
            <ShieldCheck size={14} /> Administration
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            User Management
          </h1>
          <p className="page-description text-sm text-[#94A3B8] mt-1">
            Provision employee login accounts, assign role permissions, and control tenant user access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="button button-outline flex items-center gap-2 text-sm"
            onClick={fetchUsers}
            disabled={loading}
            title="Refresh user list"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="button button-primary flex items-center gap-2 text-sm font-semibold shadow-lg shadow-[#F2A93B]/20"
            onClick={() => {
              setFormError("");
              setCreateModalOpen(true);
            }}
          >
            <UserPlus size={16} />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* 2. Filters & Search Bar */}
      <div className="panel p-4 flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500"
            placeholder="Search by name, email, employee ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8] flex items-center gap-1">
              <Filter size={13} /> Role:
            </span>
            <select
              className="text-xs py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="APPROVER">Approver</option>
              <option value="TRAVEL_DESK">Travel Desk</option>
              <option value="COMPANY_ADMIN">Company Administrator</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8]">Status:</span>
            <select
              className="text-xs py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING_ACTIVATION">Pending Activation</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {(search || roleFilter !== "ALL" || statusFilter !== "ALL") && (
            <button
              type="button"
              className="text-xs text-[#F2A93B] hover:underline px-1 py-1"
              onClick={() => {
                setSearch("");
                setRoleFilter("ALL");
                setStatusFilter("ALL");
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 3. Users Table Panel */}
      <div className="panel table-panel bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersRound size={16} className="text-[#F2A93B]" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Organization Users ({users.length})
            </h2>
          </div>
          <span className="text-xs text-[#94A3B8]">
            Company: <strong className="text-slate-900 dark:text-white">{user.companyName || user.companyCode || "Mahathi Infra Services"}</strong>
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-[#F2A93B]" />
            <p className="text-sm">Loading user directory from secure backend...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-2">
            <UsersRound size={36} className="text-[#64748B] mb-2" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No users found</h3>
            <p className="text-xs text-[#64748B] max-w-sm">
              {search || roleFilter !== "ALL" || statusFilter !== "ALL"
                ? "No accounts matched your search filters. Try adjusting the query or reset filters."
                : "No accounts have been created yet. Click 'Create User' to provision the first employee account."}
            </p>
          </div>
        ) : (
          <div className="responsive-table overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-[#94A3B8] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Email / Login</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {users.map((u) => {
                  const isCurrentUser = u.id === user.id;
                  const initials = (u.name || u.username || "U").slice(0, 2).toUpperCase();
                  const createdDate = u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—";

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:bg-slate-800/40 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-[#F2A93B]/20 text-[#F6BC55] flex items-center justify-center text-xs font-bold border border-[#F2A93B]/30 shrink-0">
                            {initials}
                          </span>
                          <div>
                            <strong className="text-slate-900 dark:text-white font-medium block">
                              {u.name || "Unnamed"}
                              {isCurrentUser && (
                                <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-[#94A3B8]">
                                  You
                                </span>
                              )}
                            </strong>
                            <small className="text-xs text-[#94A3B8]">
                              {u.designation || "Staff"}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{u.username}</span>
                      </td>

                      {/* Employee ID */}
                      <td className="py-3 px-4">
                        {u.employeeId ? (
                          <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/5 border border-slate-200 dark:border-slate-800 text-white">
                            {u.employeeId}
                          </span>
                        ) : (
                          <span className="text-xs text-[#64748B]">—</span>
                        )}
                      </td>

                      {/* Department & Role */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${roleBadgeStyle(u.role)}`}>
                            {u.role.replace("_", " ")}
                          </span>
                          {u.department && (
                            <span className="text-xs text-[#94A3B8]">{u.department}</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {u.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        ) : u.status === "PENDING_ACTIVATION" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock size={11} />
                            Pending Activation
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-4 text-xs text-[#94A3B8]">
                        {createdDate}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View details */}
                          <button
                            type="button"
                            className="p-1.5 text-[#94A3B8] hover:text-white rounded hover:bg-white/10"
                            onClick={() => setViewUser(u)}
                            title="View Account Details"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Edit details */}
                          <button
                            type="button"
                            className="p-1.5 text-[#94A3B8] hover:text-white rounded hover:bg-white/10"
                            onClick={() => openEditModal(u)}
                            title="Edit permitted details"
                          >
                            <Edit3 size={15} />
                          </button>

                          {/* Resend activation if pending */}
                          {u.hasPendingActivation && (
                            <button
                              type="button"
                              className="p-1.5 text-amber-400 hover:text-amber-300 rounded hover:bg-amber-500/10"
                              onClick={() => handleResendActivation(u)}
                              title="Regenerate / Copy Activation Link"
                            >
                              <KeyRound size={15} />
                            </button>
                          )}

                          {/* Deactivate / Reactivate (prohibited for self) */}
                          {!isCurrentUser && (
                            <button
                              type="button"
                              className={`p-1.5 rounded ${
                                u.active
                                  ? "text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                  : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              }`}
                              onClick={() => setConfirmStatusUser(u)}
                              title={u.active ? "Deactivate account" : "Reactivate account"}
                            >
                              {u.active ? <UserX size={15} /> : <UserCheck size={15} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 4. CREATE USER MODAL */}
      {/* ==================================================================== */}
      {createModalOpen && (
        <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F2A93B]/20 text-[#F6BC55] flex items-center justify-center border border-[#F2A93B]/30">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Create User Account</h3>
                  <p className="text-xs text-[#94A3B8]">Provision a new employee with an activation link</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button dialog-close"
                onClick={() => setCreateModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {/* Full Name & Work Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. Ramesh Chandra"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Work Email <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="ramesh@company.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
              </div>

              {/* Employee ID & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Employee ID <span className="text-[#64748B] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. MISPL0105"
                    value={createForm.employeeId}
                    onChange={(e) => setCreateForm({ ...createForm, employeeId: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. Operations, IT, Finance"
                    value={createForm.department}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                  />
                </div>
              </div>

              {/* Designation & Manager */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. Senior Engineer"
                    value={createForm.designation}
                    onChange={(e) => setCreateForm({ ...createForm, designation: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                    Reporting Manager
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    placeholder="e.g. Anil Kukreja"
                    value={createForm.managerName}
                    onChange={(e) => setCreateForm({ ...createForm, managerName: e.target.value })}
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Assigned Role <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {availableRoles.map((r) => (
                    <label
                      key={r.value}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer flex flex-col gap-0.5 transition-all ${
                        createForm.role === r.value
                          ? "border-[#F2A93B] bg-[#F2A93B]/10 text-white"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[#94A3B8] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{r.label}</span>
                        <input
                          type="radio"
                          name="role"
                          className="accent-[#F2A93B]"
                          checked={createForm.role === r.value}
                          onChange={() => setCreateForm({ ...createForm, role: r.value })}
                        />
                      </div>
                      <span className="text-[11px] text-[#94A3B8] leading-tight">{r.description}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Account Status */}
              <div className="pt-2 flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <strong className="text-xs font-semibold text-white block">Account Status</strong>
                  <span className="text-[11px] text-[#94A3B8]">
                    Active accounts allow the employee to log in once activated.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={createForm.active}
                    onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#F2A93B]" />
                </label>
              </div>

              <div className="dialog-actions flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  className="button button-outline text-xs"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary text-xs font-semibold flex items-center gap-1.5"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div></ModalPortal>
      )}

      {/* ==================================================================== */}
      {/* 5. ACTIVATION LINK SUCCESS MODAL */}
      {/* ==================================================================== */}
      {activationResult && (
        <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 mb-3 mx-auto">
              <CheckCircle2 size={26} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center">Account Ready for Activation</h3>
            <p className="text-xs text-[#94A3B8] text-center mt-1">
              Account provisioned for <strong className="text-slate-900 dark:text-white">{activationResult.name}</strong> ({activationResult.username}).
            </p>

            <div className="mt-4 p-3.5 bg-white/[0.03] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#94A3B8] flex items-center gap-1">
                  <KeyRound size={13} className="text-[#F2A93B]" /> Single-Use Activation Link:
                </span>
                <span className="text-[10px] text-amber-400 font-mono">Expires in 48 hours</span>
              </div>
              <div className="p-2.5 rounded-lg bg-black/40 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all">
                {window.location.origin}{activationResult.activationUrl}
              </div>
            </div>

            <div className="mt-3 p-2.5 rounded-lg bg-[#F2A93B]/10 border border-[#F2A93B]/20 text-[11px] text-[#94A3B8] flex items-start gap-2">
              <AlertCircle size={14} className="text-[#F6BC55] shrink-0 mt-0.5" />
              <span>
                Provide this link to the employee. They will visit this page to securely choose their own password and activate login.
              </span>
            </div>

            <div className="dialog-actions flex flex-col sm:flex-row items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                className="button button-outline w-full sm:w-auto text-xs flex items-center justify-center gap-1.5"
                onClick={() => setActivationResult(null)}
              >
                Close
              </button>

              <button
                type="button"
                className="button button-primary w-full sm:w-auto text-xs font-semibold flex items-center justify-center gap-1.5"
                onClick={() => activationResult.activationUrl && copyActivationLink(activationResult.activationUrl)}
              >
                {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                <span>{copied ? "Link Copied!" : "Copy Activation Link"}</span>
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {/* ==================================================================== */}
      {/* 6. EDIT USER MODAL */}
      {/* ==================================================================== */}
      {editUser && (
        <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 size={17} className="text-[#F2A93B]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit User Profile</h3>
              </div>
              <button type="button" className="icon-button dialog-close" onClick={() => setEditUser(null)}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Department
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  value={editForm.designation}
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Assigned Role
                </label>
                <select
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                >
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dialog-actions flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  className="button button-outline text-xs"
                  onClick={() => setEditUser(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary text-xs font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div></ModalPortal>
      )}

      {/* ==================================================================== */}
      {/* 7. VIEW DETAILS MODAL */}
      {/* ==================================================================== */}
      {viewUser && (
        <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <UsersRound size={17} className="text-[#F2A93B]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">User Account Details</h3>
              </div>
              <button type="button" className="icon-button dialog-close" onClick={() => setViewUser(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Full Name</span>
                <strong className="text-slate-900 dark:text-white">{viewUser.name}</strong>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Work Email</span>
                <span className="font-mono text-white">{viewUser.username}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Employee ID</span>
                <span className="font-mono text-white">{viewUser.employeeId || "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Department</span>
                <span className="text-white">{viewUser.department || "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Designation</span>
                <span className="text-white">{viewUser.designation || "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Assigned Role</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${roleBadgeStyle(viewUser.role)}`}>
                  {viewUser.role.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Account Status</span>
                <strong className={viewUser.active ? "text-emerald-400" : "text-rose-400"}>
                  {viewUser.status}
                </strong>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#94A3B8]">Tenant Organization</span>
                <span className="text-white">{viewUser.companyName || viewUser.companyCode || "Mahathi Infra Services"}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[#94A3B8]">Creation Date</span>
                <span className="text-white">
                  {viewUser.createdAt ? new Date(viewUser.createdAt).toLocaleString() : "—"}
                </span>
              </div>
            </div>

            <div className="dialog-actions flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                type="button"
                className="button button-primary text-xs"
                onClick={() => setViewUser(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {/* ==================================================================== */}
      {/* 8. CONFIRM DEACTIVATE / REACTIVATE DIALOG */}
      {/* ==================================================================== */}
      {confirmStatusUser && (
        <ModalPortal><div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 border ${
                confirmStatusUser.active
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {confirmStatusUser.active ? <UserX size={24} /> : <UserCheck size={24} />}
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {confirmStatusUser.active ? "Deactivate User Account?" : "Reactivate User Account?"}
            </h3>

            <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              {confirmStatusUser.active ? (
                <>
                  Deactivating <strong className="text-slate-900 dark:text-white">{confirmStatusUser.username}</strong> will immediately revoke access and prevent them from authenticating on any Travora service.
                </>
              ) : (
                <>
                  Reactivating <strong className="text-slate-900 dark:text-white">{confirmStatusUser.username}</strong> will restore their access to Travora using their existing credentials.
                </>
              )}
            </p>

            <div className="dialog-actions flex items-center justify-center gap-3 mt-5">
              <button
                type="button"
                className="button button-outline text-xs"
                onClick={() => setConfirmStatusUser(null)}
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`button text-xs font-semibold ${
                  confirmStatusUser.active
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
                onClick={handleToggleStatus}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Processing..."
                  : confirmStatusUser.active
                  ? "Yes, Deactivate"
                  : "Yes, Reactivate"}
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}
