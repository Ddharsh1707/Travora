function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

const isLocal =
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");
const DEFAULT_BACKEND_URL = "https://trapple.onrender.com";
const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (isLocal ? "http://localhost:8080" : DEFAULT_BACKEND_URL);

export function getResolvedUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export type Role = "EMPLOYEE" | "APPROVER" | "TRAVEL_DESK" | "ADMIN" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
export type AuthUser = {
  id: number;
  username: string;
  role: Role;
  employeeId?: string | null;
  token?: string;
  companyId?: number | null;
  companyCode?: string | null;
  companyName?: string | null;
};
export type ApiRequestOptions = RequestInit & {
  skipAuth?: boolean;
  ignoreAuthFailure?: boolean;
  timeoutMs?: number;
};

export const AUTH_EXPIRED_EVENT = "travora:auth-expired";
const VALID_ROLES: Role[] = ["EMPLOYEE", "APPROVER", "TRAVEL_DESK", "ADMIN", "COMPANY_ADMIN", "PLATFORM_ADMIN"];

export const DEMO_REQUESTS: any[] = [];
export const DEMO_BOOKINGS: any[] = [];

export type EmployeeAccount = {
  id: number;
  employeeNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName: string;
  fullName: string;
  workEmail: string;
  department: string;
  designation: string;
};

export const REGISTERED_EMPLOYEES: EmployeeAccount[] = [
  {
    id: 101,
    employeeNumber: "AGR0001",
    firstName: "Suresh Babu",
    lastName: "Dangeti",
    displayName: "Suresh Babu Dangeti",
    fullName: "Suresh Babu Dangeti",
    workEmail: "suresh@agrpetro.com",
    department: "Petroleum Operations",
    designation: "Executive",
  },
  {
    id: 102,
    employeeNumber: "AGR0003",
    firstName: "Ganesh",
    lastName: "Kakarla",
    displayName: "Ganesh Kakarla",
    fullName: "Ganesh Kakarla",
    workEmail: "site.er4@agrpetro.com",
    department: "Site Operations",
    designation: "Site Engineer",
  },
  {
    id: 103,
    employeeNumber: "AGR0007",
    firstName: "Anil",
    lastName: "Kukreja",
    displayName: "Anil Kukreja",
    fullName: "Anil Kukreja",
    workEmail: "anil.kukreja@agrpetro.com",
    department: "Operations",
    designation: "Manager",
  },
  {
    id: 104,
    employeeNumber: "AGR0009",
    firstName: "Ramana",
    lastName: "M",
    displayName: "Ramana M",
    fullName: "Ramana M",
    workEmail: "sureshbabu506@gmail.com",
    department: "Operations",
    designation: "Operations Executive",
  },
  {
    id: 105,
    employeeNumber: "MISPL0001",
    firstName: "Umamaheswari",
    lastName: "Yandapalli",
    displayName: "Umamaheswari Yandapalli",
    fullName: "Umamaheswari Yandapalli",
    workEmail: "umamaheswari@gmail.com",
    department: "Corporate Management",
    designation: "Director",
  },
  {
    id: 106,
    employeeNumber: "MISPL0002",
    firstName: "Kalyan",
    middleName: "Swaroop",
    lastName: "Yandapalli",
    displayName: "YKS",
    fullName: "Kalyan Swaroop Yandapalli",
    workEmail: "yks@mahathiinfra.com",
    department: "Executive Management",
    designation: "Managing Director",
  },
  {
    id: 107,
    employeeNumber: "MISPL0003",
    firstName: "Himani",
    lastName: "Agarwal",
    displayName: "Himani Agarwal",
    fullName: "Himani Agarwal",
    workEmail: "himani.ag@mahathiinfra.com",
    department: "Finance & Accounts",
    designation: "Finance Manager",
  },
  {
    id: 108,
    employeeNumber: "MISPL0007",
    firstName: "Sirisha",
    lastName: "Vegaraju",
    displayName: "Sirisha Vegaraju",
    fullName: "Sirisha Vegaraju",
    workEmail: "sirisha@mahathiinfra.com",
    department: "Administration",
    designation: "Executive Admin",
  },
  {
    id: 109,
    employeeNumber: "MISPL0014",
    firstName: "Vijaya Kumar",
    lastName: "Bgam",
    displayName: "Bagam Vijaya Kumar",
    fullName: "Vijaya Kumar Bgam",
    workEmail: "kumar.bv@mahathiinfra.com",
    department: "Project Engineering",
    designation: "Senior Project Engineer",
  },
  {
    id: 110,
    employeeNumber: "MISPL0016",
    firstName: "P",
    lastName: "Satheesh",
    displayName: "P Satheesh",
    fullName: "P Satheesh",
    workEmail: "satheesh@mahathiinfra.com",
    department: "Field Engineering",
    designation: "Project Lead",
  },
  {
    id: 111,
    employeeNumber: "MISPL0020",
    firstName: "Satya",
    middleName: "Prasad",
    lastName: "B",
    displayName: "B Satya Prasad",
    fullName: "Satya Prasad B",
    workEmail: "satya.prasad@mahathiinfra.com",
    department: "Procurement",
    designation: "Procurement Manager",
  },
  {
    id: 112,
    employeeNumber: "MISPL0027",
    firstName: "M Murali",
    middleName: "Dhara",
    lastName: "Reddy",
    displayName: "M Murali Dhara Reddy",
    fullName: "M Murali Dhara Reddy",
    workEmail: "murali.reddy@mahathiinfra.com",
    department: "Infrastructure Planning",
    designation: "General Manager",
  },
  {
    id: 113,
    employeeNumber: "MISPL0130",
    firstName: "Deena",
    middleName: "Raju",
    lastName: "Karra",
    displayName: "Deena Raju Karra",
    fullName: "Deena Raju Karra",
    workEmail: "deenaraju@mahathiinfra.com",
    department: "Commercial & Contracts",
    designation: "Commercial Manager",
  },
  {
    id: 114,
    employeeNumber: "MISPL0164",
    firstName: "D Vasantha",
    lastName: "Lakshmi",
    displayName: "D Vasantha Lakshmi",
    fullName: "D Vasantha Lakshmi",
    workEmail: "hr@mahathiinfra.com",
    department: "Human Resources",
    designation: "HR Head",
  },
  {
    id: 115,
    employeeNumber: "MISPL0275",
    firstName: "Sulamangalam",
    middleName: "Dinesh",
    lastName: "Kumar",
    displayName: "S Dinesh Kumar",
    fullName: "Sulamangalam Dinesh Kumar",
    workEmail: "dinesh.s@mahathiinfra.com",
    department: "Quality Assurance",
    designation: "QA/QC Lead",
  },
  {
    id: 116,
    employeeNumber: "MISPL0333",
    firstName: "Mohan",
    lastName: "Jagatha",
    displayName: "Mohan Jagatha",
    fullName: "Mohan Jagatha",
    workEmail: "mohan.j@mahathiinfra.com",
    department: "Logistics & Supply",
    designation: "Supply Chain Executive",
  },
  {
    id: 117,
    employeeNumber: "MISPL0372",
    firstName: "Vidyasagar",
    lastName: "Gorantala",
    displayName: "G Vidyasagar",
    fullName: "Vidyasagar Gorantala",
    workEmail: "vidyasagar.g@mahathiinfra.com",
    department: "Civil & Structural",
    designation: "Structural Engineer",
  },
  {
    id: 118,
    employeeNumber: "MISPL0387",
    firstName: "Thenmozhi",
    lastName: "S",
    displayName: "Thenmozhi",
    fullName: "Thenmozhi S",
    workEmail: "thenmozhi@mahathiinfra.com",
    department: "Design & Drafting",
    designation: "Senior Design Engineer",
  },
  {
    id: 119,
    employeeNumber: "MISPL0402",
    firstName: "G Yathish",
    middleName: "Sai Krishna",
    lastName: "Posi",
    displayName: "G Yathish Posi Sai Krishna",
    fullName: "G Yathish Sai Krishna Posi",
    workEmail: "yathish.g@mahathiinfra.com",
    department: "Instrumentation",
    designation: "Instrumentation Engineer",
  },
  {
    id: 120,
    employeeNumber: "MISPL0409",
    firstName: "Ravi",
    middleName: "Raghavendra Durga Prasad",
    lastName: "K",
    displayName: "K Ravi Raghavendra Durga Prasad",
    fullName: "Ravi Raghavendra Durga Prasad K",
    workEmail: "prasad@mahathiinfra.com",
    department: "Electrical & Instrumentation",
    designation: "Project Manager",
  },
  {
    id: 121,
    employeeNumber: "MISPL0415",
    firstName: "Kranthi",
    lastName: "Bharkam",
    displayName: "Kranthi Bharkam",
    fullName: "Kranthi Bharkam",
    workEmail: "kranthi.b@mahathiinfra.com",
    department: "Mechanical Systems",
    designation: "Mechanical Engineer",
  },
  {
    id: 122,
    employeeNumber: "MISPL0423",
    firstName: "Rammohan",
    lastName: "Gubbala",
    displayName: "Rammohan Gubbala",
    fullName: "Rammohan Gubbala",
    workEmail: "g.rammohan@mahathiinfra.com",
    department: "Safety & HSE",
    designation: "HSE Officer",
  },
  {
    id: 123,
    employeeNumber: "MISPL0429",
    firstName: "Uppu",
    lastName: "Durga Rao",
    displayName: "Uppu Durga Rao",
    fullName: "Uppu Durga Rao",
    workEmail: "durgarao@mahathiinfra.com",
    department: "Piping Engineering",
    designation: "Piping Lead",
  },
  {
    id: 124,
    employeeNumber: "MISPL0430",
    firstName: "Malaya",
    lastName: "Kumar",
    displayName: "Malaya Kumar",
    fullName: "Malaya Kumar",
    workEmail: "malayakumar@mahathiinfra.com",
    department: "Planning & Controls",
    designation: "Planning Engineer",
  },
  {
    id: 125,
    employeeNumber: "MISPL0440",
    firstName: "Dileep Kumar",
    lastName: "Gode",
    displayName: "Dileep Kumar Gode",
    fullName: "Dileep Kumar Gode",
    workEmail: "dileep.g@mahathiinfra.com",
    department: "Maintenance & Reliability",
    designation: "Site Supervisor",
  },
  {
    id: 126,
    employeeNumber: "MISPL0466",
    firstName: "Panthangi",
    lastName: "Shashidhar",
    displayName: "Panthangi Shashidhar",
    fullName: "Panthangi Shashidhar",
    workEmail: "shashidhar@mahathiinfra.com",
    department: "Operations Coordination",
    designation: "Operations Lead",
  },
  {
    id: 127,
    employeeNumber: "MISPL0485",
    firstName: "Sumanth Krishna",
    lastName: "Gaddam",
    displayName: "Sumanth Krishna Gaddam",
    fullName: "Sumanth Krishna Gaddam",
    workEmail: "g.sumanthkrishna@mahathiinfra.com",
    department: "Technology & Systems",
    designation: "Systems Engineer",
  },
];

export const DEMO_EMPLOYEES = REGISTERED_EMPLOYEES.map((emp) => ({
  id: String(emp.id),
  name: emp.fullName,
  displayName: emp.displayName,
  department: emp.department,
  designation: emp.designation,
  employeeId: emp.employeeNumber,
  email: emp.workEmail,
}));

export function getToken() {
  if (!hasStorage()) return null;
  const token = window.localStorage.getItem("trapple_token") || window.localStorage.getItem("travora_token");
  return token?.trim() || null;
}

export function getStoredUser<T = AuthUser>(): T | null {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem("trapple_user") || window.localStorage.getItem("travora_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function isValidAuthUser(user: AuthUser | null): user is AuthUser {
  return Boolean(user && Number.isFinite(user.id) && user.username && VALID_ROLES.includes(user.role));
}

export function clearAuth({ notify = false }: { notify?: boolean } = {}) {
  if (!hasStorage()) return;
  window.localStorage.removeItem("trapple_token");
  window.localStorage.removeItem("trapple_user");
  window.localStorage.removeItem("travora_token");
  window.localStorage.removeItem("travora_user");
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith("trapple_expenses_") || key.startsWith("travora_expenses_"))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
  if (notify && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { skipAuth, ignoreAuthFailure, timeoutMs = 15000, headers, ...requestOptions } = options;
  const token = getToken();
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const targetUrl = getResolvedUrl(path);

  try {
    response = await fetch(targetUrl, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    // If request returned HTML fallback (proxy unreachable) or Vercel Deployment Protection intercept,
    // fallback to direct Render backend URL
    const contentType = response.headers.get("content-type") || "";
    let shouldDirectFallback =
      targetUrl !== `${DEFAULT_BACKEND_URL}${path}` &&
      contentType.includes("text/html");

    if (shouldDirectFallback) {
      response = await fetch(`${DEFAULT_BACKEND_URL}${path}`, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      });
    }
  } catch {
    if (targetUrl !== `${DEFAULT_BACKEND_URL}${path}`) {
      try {
        response = await fetch(`${DEFAULT_BACKEND_URL}${path}`, {
          ...requestOptions,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
          },
        });
      } catch {
        throw new Error("We couldn't reach Trapple. Check your connection and try again.");
      }
    } else {
      throw new Error("We couldn't reach Trapple. Check your connection and try again.");
    }
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  const isHtml = (response.headers.get("content-type") || "").includes("text/html") || body.trim().startsWith("<!doctype") || body.trim().startsWith("<!DOCTYPE") || body.trim().startsWith("<html");
  if (isHtml) {
    throw new Error("Trapple backend server not reached (HTML fallback). Verify backend hosting URL.");
  }
  let data: unknown = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body || null; }
  if (response.status === 401) {
    if (skipAuth || ignoreAuthFailure) {
      throw new Error("Unauthorized");
    }
    clearAuth({ notify: true });
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (response.status === 403) throw new Error("You don't have permission to access this area.");
  if (!response.ok) {
    const message = typeof data === "object" && data !== null ? (data as { message?: string; error?: string }).message || (data as { error?: string }).error : undefined;
    throw new Error(message || (response.status >= 500 ? "Trapple is having trouble right now. Please try again." : "Something went wrong. Please try again."));
  }
  return data as T;
}

export async function login(credentials: { username: string; password: string }): Promise<AuthUser> {
  const rawUser = (credentials.username || "").trim();
  const rawPass = (credentials.password || "").trim();

  if (!rawUser) {
    throw new Error("Please enter your Login ID / Employee Number.");
  }
  if (!rawPass) {
    throw new Error("Please enter your password.");
  }

  try {
    const response = await apiRequest<Partial<AuthUser> & { token?: string; role?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: rawUser, password: rawPass }),
      skipAuth: true,
      ignoreAuthFailure: true,
      timeoutMs: 90000,
    });
    const role = String(response.role || "").toUpperCase() as Role;
    if (response.token && response.username && VALID_ROLES.includes(role) && response.id !== undefined && response.id !== null) {
      return { ...response, id: Number(response.id), role, token: response.token } as AuthUser;
    }
    throw new Error("Authentication succeeded but returned invalid user data.");
  } catch (err: any) {
    const msg = err?.message || "";
    if (
      msg.includes("couldn't reach") ||
      msg.includes("not reached") ||
      msg.includes("failed to fetch") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("aborted")
    ) {
      throw new Error("Unable to reach the Trapple authentication service. The cloud server may still be spinning up from idle sleep — please wait a moment and try again.");
    }
    throw err;
  }
}

export function persistAuth(user: AuthUser) {
  if (!user.token) throw new Error("Cannot create an authenticated session without a JWT.");
  window.localStorage.setItem("trapple_token", user.token);
  window.localStorage.setItem("trapple_user", JSON.stringify({ id: user.id, username: user.username, role: user.role, employeeId: user.employeeId ?? null }));
  window.localStorage.setItem("travora_token", user.token);
  window.localStorage.setItem("travora_user", JSON.stringify({ id: user.id, username: user.username, role: user.role, employeeId: user.employeeId ?? null }));
}

/**
 * ─── UNIFIED SYSTEM STORAGE KEYS & TOMBSTONES ───
 */
const SYSTEM_REQUESTS_KEY = "travora_system_requests";
const SYSTEM_BOOKINGS_KEY = "travora_system_bookings";
const SYSTEM_BULK_BOOKINGS_KEY = "travora_system_bulk_bookings_v1";
const SYSTEM_NOTIFICATIONS_KEY = "travora_system_notifications";
const DELETED_REQUESTS_KEY = "travora_deleted_request_ids";
const DELETED_BOOKINGS_KEY = "travora_deleted_booking_ids";
const DELETED_BULK_BOOKINGS_KEY = "travora_deleted_bulk_booking_ids";

export function getDeletedRequestIds(): Set<string> {
  if (!hasStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_REQUESTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch (e) {
    console.warn("Failed to read deleted request ids", e);
  }
  return new Set();
}

export function markRequestIdsDeleted(ids: Array<string | number>) {
  if (!hasStorage()) return;
  try {
    const set = getDeletedRequestIds();
    ids.forEach((id) => {
      if (id !== undefined && id !== null) set.add(String(id));
    });
    window.localStorage.setItem(DELETED_REQUESTS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn("Failed to save deleted request ids", e);
  }
}

export function getDeletedBookingIds(): Set<string> {
  if (!hasStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_BOOKINGS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch (e) {
    console.warn("Failed to read deleted booking ids", e);
  }
  return new Set();
}

export function markBookingIdsDeleted(ids: Array<string | number>) {
  if (!hasStorage()) return;
  try {
    const set = getDeletedBookingIds();
    ids.forEach((id) => {
      if (id !== undefined && id !== null) set.add(String(id));
    });
    window.localStorage.setItem(DELETED_BOOKINGS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn("Failed to save deleted booking ids", e);
  }
}

export function getDeletedBulkBookingIds(): Set<string> {
  if (!hasStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_BULK_BOOKINGS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch (e) {
    console.warn("Failed to read deleted bulk booking ids", e);
  }
  return new Set();
}

export function markBulkBookingIdsDeleted(ids: Array<string | number>) {
  if (!hasStorage()) return;
  try {
    const set = getDeletedBulkBookingIds();
    ids.forEach((id) => {
      if (id !== undefined && id !== null) set.add(String(id));
    });
    window.localStorage.setItem(DELETED_BULK_BOOKINGS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn("Failed to save deleted bulk booking ids", e);
  }
}

/**
 * ─── LEGACY DATA PURGE & SANITIZATION ───
 * Runs immediately on startup to remove legacy demo trips and default bulk records.
 */
function _sanitizeLocalStorage() {
  if (!hasStorage()) return;
  try {
    const SANITIZE_VERSION = "travora_v7_no_bulk_defaults";
    if (window.localStorage.getItem(SANITIZE_VERSION) === "true") return;

    // Permanently tombstone and purge default mock bulk bookings (GRP-BK-101 and GRP-BK-102)
    markBulkBookingIdsDeleted(["GRP-BK-101", "GRP-BK-102"]);
    const currentBulk = window.localStorage.getItem(SYSTEM_BULK_BOOKINGS_KEY);
    if (currentBulk) {
      try {
        const parsed = JSON.parse(currentBulk);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((b) => b && b.id !== "GRP-BK-101" && b.id !== "GRP-BK-102");
          window.localStorage.setItem(SYSTEM_BULK_BOOKINGS_KEY, JSON.stringify(filtered));
        }
      } catch {
        window.localStorage.removeItem(SYSTEM_BULK_BOOKINGS_KEY);
      }
    }

    // Remove legacy unnamespaced and migrated keys
    const LEGACY_KEYS = [
      "travora_v4_clean",
      "travora_v6_sync_clean",
      "travora_migration_done",
      "travora_local_requests",
      "travora_local_bookings",
      "travora_deleted_requests",
      "travora_deleted_bookings",
      "travora_all_wiped",
      "travora_expenses",
    ];
    LEGACY_KEYS.forEach((k) => window.localStorage.removeItem(k));

    // Inspect all keys in localStorage to purge contaminated records
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith("travora_local_") ||
        key.startsWith("travora_deleted_") ||
        key.startsWith("travora_all_wiped_")
      ) {
        const val = window.localStorage.getItem(key) || "";
        if (
          val.includes("EMP-2026") ||
          val.includes("Arjun Mehta") ||
          val.includes("TR-9021") ||
          val.includes("TR-9022") ||
          val.includes("TR-9023") ||
          val.includes("TR-9024") ||
          val.includes("BK-701")
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    window.localStorage.setItem(SANITIZE_VERSION, "true");
  } catch (e) {
    console.warn("Storage sanitization error:", e);
  }
}

// Run sanitization immediately
_sanitizeLocalStorage();



/**
 * ─── REAL-TIME SYNCHRONIZATION ARCHITECTURE NOTE ───
 * Insecure public pub/sub broker channels (ntfy.sh) have been permanently removed.
 * Future real-time updates should be mediated through the authenticated Spring Boot backend,
 * e.g., via authenticated Server-Sent Events (GET /api/events/stream) or authenticated STOMP WebSockets
 * strictly enforcing user identity and multi-tenant authorization boundaries.
 */
export async function manualCloudSync(): Promise<{ success: boolean; count: number }> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trapple_cloud_synced"));
    window.dispatchEvent(new CustomEvent("travora_cloud_synced"));
  }
  return { success: true, count: 0 };
}

export type BulkBookingPassenger = {
  name: string;
  employeeId?: string;
  department?: string;
  seatOrCoach?: string;
};

export type BulkBookingRecord = {
  id: string;
  title: string;
  destination: string;
  fromLocation: string;
  travelDates: string;
  departureDate?: string;
  returnDate?: string;
  travelMode: "FLIGHT" | "TRAIN" | "BUS" | "HOTEL" | "MULTI_MODAL";
  provider: string;
  groupReference: string;
  headcount: number;
  totalCost: number;
  costPerPerson: number;
  savings?: number;
  project?: string;
  departments?: string[];
  passengerManifestSummary?: string;
  passengerList?: BulkBookingPassenger[];
  itineraryNotes?: string;
  coordinatorName?: string;
  loggedAt: string;
  status: "CONFIRMED" | "IN_REVIEW" | "CANCELLED";
  approverStatus?: "APPROVED" | "PENDING_REVIEW" | "NOTED";
  approverComment?: string;
  approverReviewedAt?: string;
  attachmentName?: string;
  attachmentData?: string;
};



export const travelRequestsApi = {
  list: async () => {
    return await apiRequest<any[]>("/api/travel-requests", { timeoutMs: 15000 });
  },

  get: async (id: string | number) => {
    return await apiRequest<any>(`/api/travel-requests/${id}`, { timeoutMs: 15000 });
  },

  create: async (payload: unknown) => {
    return await apiRequest<any>("/api/travel-requests", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  approve: async (id: string | number, approverName: string, comment = "") => {
    return await apiRequest<any>(`/api/travel-requests/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ approverName, comment }),
      timeoutMs: 15000,
    });
  },

  reject: async (id: string | number, approverName: string, comment = "") => {
    return await apiRequest<any>(`/api/travel-requests/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ approverName, comment }),
      timeoutMs: 15000,
    });
  },

  delete: async (id: string | number) => {
    await apiRequest(`/api/travel-requests/${id}`, {
      method: "DELETE",
      timeoutMs: 15000,
    });
    return { success: true, id: String(id) };
  },

  deleteAll: async () => {
    await apiRequest("/api/travel-requests/all", {
      method: "DELETE",
      timeoutMs: 15000,
    });
    return { success: true };
  },

  deletePastOrCompleted: async (options?: { includeApproved?: boolean; includeBooked?: boolean }) => {
    const list = await apiRequest<any[]>("/api/travel-requests", { timeoutMs: 15000 });
    const todayStr = new Date().toISOString().split("T")[0];
    let count = 0;
    if (Array.isArray(list)) {
      for (const r of list) {
        const status = String(r.status || "").toUpperCase();
        const returnDate = r.returnDate ? String(r.returnDate).split("T")[0] : null;
        const travelDate = r.travelDate ? String(r.travelDate).split("T")[0] : null;
        const isPastDate = (returnDate && returnDate < todayStr) || (!returnDate && travelDate && travelDate < todayStr);

        let shouldDelete = false;
        if (options?.includeApproved && status !== "PENDING") {
          shouldDelete = true;
        } else if (status === "COMPLETED" || status === "CANCELLED" || status === "REJECTED" || isPastDate) {
          shouldDelete = true;
        } else if (options?.includeBooked && status === "BOOKED") {
          shouldDelete = true;
        }

        if (shouldDelete && r.id) {
          try {
            await apiRequest(`/api/travel-requests/${r.id}`, { method: "DELETE", timeoutMs: 5000 });
            count++;
          } catch {}
        }
      }
    }
    return { success: true, count };
  },

  clearDecisionHistory: async () => {
    return travelRequestsApi.deletePastOrCompleted({ includeApproved: true });
  },

  resetDemo: async () => {
    throw new Error("Demo data restoration has been decommissioned. All records must originate from the authoritative backend.");
  },
};

export const bookingsApi = {
  list: async () => {
    return await apiRequest<any[]>("/api/bookings", { timeoutMs: 15000 });
  },

  byTravelRequest: async (id: string | number) => {
    return await apiRequest<any>(`/api/bookings/travel-request/${id}`, { timeoutMs: 15000 });
  },

  getByTravelRequestId: async (id: string | number) => {
    return await apiRequest<any>(`/api/bookings/travel-request/${id}`, { timeoutMs: 15000 });
  },

  create: async (payload: any) => {
    return await apiRequest<any>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  update: async (id: string | number, payload: any) => {
    return await apiRequest<any>(`/api/bookings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  cancel: async (id: string | number, reason: string, cancellationCharge = 0) => {
    return await apiRequest<any>(
      `/api/bookings/${id}/cancel?reason=${encodeURIComponent(reason)}&cancellationCharge=${encodeURIComponent(String(cancellationCharge))}`,
      {
        method: "PUT",
        timeoutMs: 15000,
      }
    );
  },

  delete: async (id: string | number) => {
    await apiRequest(`/api/bookings/${id}`, {
      method: "DELETE",
      timeoutMs: 15000,
    });
    return { success: true, id: String(id) };
  },

  deleteAll: async () => {
    return { success: true };
  },
};

export const notificationsApi = {
  list: async () => {
    const data = await apiRequest<any[]>("/api/notifications", { timeoutMs: 15000 });
    return Array.isArray(data) ? data : [];
  },

  unreadCount: async () => {
    const count = await apiRequest<number>("/api/notifications/unread-count", { timeoutMs: 15000 });
    return typeof count === "number" ? count : 0;
  },

  markRead: async (id: string | number) => {
    await apiRequest(`/api/notifications/${id}/read`, {
      method: "PATCH",
      timeoutMs: 15000,
    });
    return { id, read: true };
  },

  markAllRead: async () => {
    await apiRequest("/api/notifications/read-all", {
      method: "PATCH",
      timeoutMs: 15000,
    });
    return { success: true };
  },
};

export type EmployeeRecord = {
  id: number;
  employeeId: string;
  name: string;
  department?: string | null;
  designation?: string | null;
  location?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  active: boolean;
  companyId?: number;
  companyCode?: string;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PaginatedEmployees = {
  content: EmployeeRecord[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
};

export const employeesApi = {
  list: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    active?: boolean;
    sort?: string;
  }): Promise<PaginatedEmployees> => {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set("page", String(params.page));
    if (params?.size !== undefined) query.set("size", String(params.size));
    if (params?.search && params.search.trim()) query.set("search", params.search.trim());
    if (params?.active !== undefined) query.set("active", String(params.active));
    if (params?.sort) query.set("sort", params.sort);
    const qs = query.toString() ? `?${query.toString()}` : "";
    const res = await apiRequest<any>(`/api/employees${qs}`, { timeoutMs: 15000 });
    if (Array.isArray(res)) {
      return {
        content: res,
        page: 0,
        size: res.length,
        totalElements: res.length,
        totalPages: 1,
        last: true,
        first: true,
      };
    }
    return res as PaginatedEmployees;
  },

  getById: async (id: number | string): Promise<EmployeeRecord> => {
    return await apiRequest<EmployeeRecord>(`/api/employees/${id}`, { timeoutMs: 15000 });
  },

  getByEmployeeId: async (id: string): Promise<EmployeeRecord> => {
    return await apiRequest<EmployeeRecord>(`/api/employees/employee-id/${encodeURIComponent(id)}`, { timeoutMs: 15000 });
  },

  create: async (payload: Partial<EmployeeRecord>): Promise<EmployeeRecord> => {
    return await apiRequest<EmployeeRecord>("/api/employees", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  update: async (id: number | string, payload: Partial<EmployeeRecord>): Promise<EmployeeRecord> => {
    return await apiRequest<EmployeeRecord>(`/api/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  delete: async (id: number | string): Promise<void> => {
    await apiRequest(`/api/employees/${id}`, { method: "DELETE", timeoutMs: 15000 });
  },
};

export const dashboardApi = {
  summary: async () => {
    return await apiRequest<any>("/api/dashboard/summary", { timeoutMs: 15000 });
  },
};

export const bulkBookingsApi = {
  list: async (): Promise<BulkBookingRecord[]> => {
    return await apiRequest<BulkBookingRecord[]>("/api/bulk-bookings", { timeoutMs: 15000 });
  },

  getById: async (id: string | number): Promise<BulkBookingRecord | null> => {
    return await apiRequest<BulkBookingRecord>(`/api/bulk-bookings/${id}`, { timeoutMs: 15000 });
  },

  create: async (payload: Partial<BulkBookingRecord>): Promise<BulkBookingRecord> => {
    const headcount = Math.max(1, Number(payload.headcount) || 1);
    const totalCost = Number(payload.totalCost) || 0;
    const costPerPerson = headcount > 0 ? Math.round(totalCost / headcount) : totalCost;

    return await apiRequest<BulkBookingRecord>("/api/bulk-bookings", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        headcount,
        totalCost,
        costPerPerson,
      }),
      timeoutMs: 15000,
    });
  },

  update: async (id: string | number, payload: Partial<BulkBookingRecord>): Promise<BulkBookingRecord> => {
    return await apiRequest<BulkBookingRecord>(`/api/bulk-bookings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  reviewByApprover: async (
    id: string | number,
    status: "APPROVED" | "NOTED" | "REJECTED",
    comment: string = ""
  ): Promise<BulkBookingRecord> => {
    return await apiRequest<BulkBookingRecord>(`/api/bulk-bookings/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, comment }),
      timeoutMs: 15000,
    });
  },

  delete: async (id: string | number): Promise<{ success: boolean }> => {
    await apiRequest(`/api/bulk-bookings/${id}`, {
      method: "DELETE",
      timeoutMs: 15000,
    });
    return { success: true };
  },
};

export const healthApi = {
  check: async () => {
    return await apiRequest<string>("/api/health", { timeoutMs: 5000 });
  },
};

export interface ImportBatchResponse {
  id: number;
  filename: string;
  originalFilename: string;
  fileType: "XLSX" | "CSV";
  sheetNames: string[];
  selectedSheet: string;
  importType: string;
  status: "PREVIEW" | "IMPORTING" | "COMPLETED" | "FAILED" | "EXPIRED";
  totalRows: number;
  validRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  columnMapping: Record<string, string>;
  suggestedMapping: Record<string, string>;
  availableHeaders: string[];
  createdAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export interface ImportedRecordResponse {
  id: number;
  importBatchId: number;
  rawEmployeeIdentifier?: string | null;
  rawEmployeeName?: string | null;
  matchedEmployeeId?: number | null;
  matchedEmployeeName?: string | null;
  matchedEmployeeCode?: string | null;
  travelDate?: string | null;
  returnDate?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  ticketReference?: string | null;
  department?: string | null;
  travelMode?: string | null;
  provider?: string | null;
  cost?: number | null;
  projectName?: string | null;
  status: "PENDING" | "VALID" | "MATCHED" | "UNMATCHED" | "DUPLICATE" | "INVALID" | "IMPORTED" | "SKIPPED";
  matchConfidence?: "HIGH" | "MEDIUM" | "AMBIGUOUS" | "LOW" | "NONE";
  validationErrors: string[];
  sourceRowNumber: number;
  imported: boolean;
  rawRowData?: string | null;
}

export interface ImportResultResponse {
  batchId: number;
  totalAttempted: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: number;
  status: string;
  sampleImported: ImportedRecordResponse[];
}

export interface PaginatedResult<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
}

export const importsApi = {
  upload: async (file: File, sheet?: string): Promise<ImportBatchResponse> => {
    if (!file) {
      throw new Error("Please select a valid .xlsx or .csv spreadsheet to upload.");
    }
    const formData = new FormData();
    formData.append("file", file);
    if (sheet) formData.append("sheet", sheet);

    const token = getToken();
    const uploadUrl = getResolvedUrl("/api/imports/upload");
    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const contentType = res.headers.get("content-type") || "";
      if (uploadUrl !== `${DEFAULT_BACKEND_URL}/api/imports/upload` && contentType.includes("text/html")) {
        res = await fetch(`${DEFAULT_BACKEND_URL}/api/imports/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }
    } catch {
      if (uploadUrl !== `${DEFAULT_BACKEND_URL}/api/imports/upload`) {
        try {
          res = await fetch(`${DEFAULT_BACKEND_URL}/api/imports/upload`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
        } catch {
          throw new Error("We couldn't reach Trapple. Check your connection and try again.");
        }
      } else {
        throw new Error("We couldn't reach Trapple. Check your connection and try again.");
      }
    }

    const bodyText = await res.text();
    const isHtml =
      (res.headers.get("content-type") || "").includes("text/html") ||
      bodyText.trim().startsWith("<!doctype") ||
      bodyText.trim().startsWith("<!DOCTYPE") ||
      bodyText.trim().startsWith("<html");

    if (isHtml) {
      throw new Error("Trapple backend server not reached (HTML fallback). Verify backend hosting URL.");
    }

    let data: any = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      data = null;
    }

    if (res.status === 401) {
      clearAuth({ notify: true });
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (res.status === 403) {
      throw new Error("You do not have permission to upload spreadsheets (Travel Desk or Admin role required).");
    }

    if (res.status === 413) {
      throw new Error("The uploaded file exceeds the 20MB maximum size limit. Please upload a smaller file or split the spreadsheet.");
    }

    if (!res.ok) {
      const serverMessage =
        data?.detail ||
        data?.message ||
        data?.error ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.defaultMessage || e.message || String(e)).join(", ") : undefined) ||
        (typeof data === "string" && data.trim().length > 0 ? data : undefined);

      throw new Error(
        serverMessage ||
        (res.status >= 500
          ? "Trapple backend encountered an error processing the spreadsheet. Please verify file format and try again."
          : `Failed to upload spreadsheet (HTTP ${res.status}).`)
      );
    }

    return data as ImportBatchResponse;
  },

  listBatches: async (params?: { page?: number; size?: number }): Promise<PaginatedResult<ImportBatchResponse>> => {
    const q = new URLSearchParams();
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.size !== undefined) q.set("size", String(params.size));
    const url = q.toString() ? `/api/imports?${q.toString()}` : "/api/imports";
    return await apiRequest<PaginatedResult<ImportBatchResponse>>(url);
  },

  getBatch: async (batchId: number | string): Promise<ImportBatchResponse> => {
    return await apiRequest<ImportBatchResponse>(`/api/imports/${batchId}`);
  },

  getRecords: async (
    batchId: number | string,
    params?: { search?: string; status?: string; page?: number; size?: number }
  ): Promise<PaginatedResult<ImportedRecordResponse>> => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status && params.status !== "ALL") q.set("status", params.status);
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.size !== undefined) q.set("size", String(params.size));
    const url = `/api/imports/${batchId}/records?${q.toString()}`;
    return await apiRequest<PaginatedResult<ImportedRecordResponse>>(url);
  },

  updateMapping: async (
    batchId: number | string,
    columnMapping: Record<string, string>,
    sheetName?: string
  ): Promise<ImportBatchResponse> => {
    return await apiRequest<ImportBatchResponse>(`/api/imports/${batchId}/mapping`, {
      method: "PUT",
      body: JSON.stringify({ columnMapping, sheetName }),
    });
  },

  confirm: async (
    batchId: number | string,
    recordIds?: number[]
  ): Promise<ImportResultResponse> => {
    return await apiRequest<ImportResultResponse>(`/api/imports/${batchId}/confirm`, {
      method: "POST",
      body: JSON.stringify({ recordIds }),
    });
  },

  searchTravelHistory: async (params?: {
    search?: string;
    employeeId?: number;
    fromDate?: string;
    toDate?: string;
    page?: number;
    size?: number;
  }): Promise<PaginatedResult<ImportedRecordResponse>> => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.employeeId) q.set("employeeId", String(params.employeeId));
    if (params?.fromDate) q.set("fromDate", params.fromDate);
    if (params?.toDate) q.set("toDate", params.toDate);
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.size !== undefined) q.set("size", String(params.size));
    return await apiRequest<PaginatedResult<ImportedRecordResponse>>(`/api/imports/travel-history?${q.toString()}`);
  },

  exportTravelHistoryUrl: (params?: {
    search?: string;
    employeeId?: number;
    fromDate?: string;
    toDate?: string;
  }): string => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.employeeId) q.set("employeeId", String(params.employeeId));
    if (params?.fromDate) q.set("fromDate", params.fromDate);
    if (params?.toDate) q.set("toDate", params.toDate);
    const queryString = q.toString();
    return queryString ? `${API_BASE_URL}/api/imports/travel-history/export?${queryString}` : `${API_BASE_URL}/api/imports/travel-history/export`;
  },

  exportTravelHistory: async (params?: {
    search?: string;
    employeeId?: number;
    fromDate?: string;
    toDate?: string;
  }): Promise<void> => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.employeeId) q.set("employeeId", String(params.employeeId));
    if (params?.fromDate) q.set("fromDate", params.fromDate);
    if (params?.toDate) q.set("toDate", params.toDate);

    const token = typeof window !== "undefined" ? (window.localStorage.getItem("trapple_token") || window.localStorage.getItem("travora_token")) : null;
    const res = await fetch(`${API_BASE_URL}/api/imports/travel-history/export?${q.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error("Failed to export travel history CSV.");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travel_history_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};

export interface SpendFilterParams {
  search?: string;
  department?: string;
  employeeId?: string;
  provider?: string;
  travelMode?: string;
  financialYear?: string;
  period?: string;
  fromDate?: string;
  toDate?: string;
}

export interface MonthlySpendTrend {
  monthKey: string;
  monthLabel: string;
  totalSpend: number;
  tripCount: number;
  travelerCount: number;
}

export interface FinancialYearSpend {
  financialYear: string;
  totalSpend: number;
  tripCount: number;
  travelerCount: number;
}

export interface ExecutiveSpendOverview {
  totalSpend: number;
  totalTrips: number;
  travelerCount: number;
  avgSpendPerTrip: number;
  avgSpendPerTraveler: number;
  highestSpendingEmployee?: {
    employeeIdentifier: string;
    employeeName: string;
    department: string;
    totalSpend: number;
    tripCount: number;
  } | null;
  highestSpendingDepartment?: {
    department: string;
    totalSpend: number;
    tripCount: number;
    travelerCount: number;
  } | null;
  spendByFinancialYear: FinancialYearSpend[];
  monthOnMonthSpend: MonthlySpendTrend[];
  dataTraceability: {
    totalRecordsEvaluated: number;
    recordsWithCost: number;
    recordsWithoutCost: number;
    dateRangeStart?: string | null;
    dateRangeEnd?: string | null;
    currency: string;
  };
}

export interface EmployeeSpendSummary {
  employeeIdentifier: string;
  employeeName: string;
  department: string;
  tripCount: number;
  totalSpend: number;
  avgSpendPerTrip: number;
  firstTripDate?: string | null;
  lastTripDate?: string | null;
  topDestination: string;
  domesticTrips: number;
  internationalTrips: number;
}

export interface DepartmentSpendSummary {
  department: string;
  totalSpend: number;
  employeeCount: number;
  tripCount: number;
  avgSpendPerEmployee: number;
  shareOfTotalSpend: number;
}

export interface DestinationMetric {
  destination: string;
  tripCount: number;
  totalSpend: number;
  avgCost: number;
}

export interface RouteMetric {
  origin: string;
  destination: string;
  routeLabel: string;
  tripCount: number;
  totalSpend: number;
  avgCost: number;
}

export interface DestinationAnalysis {
  topDestinations: DestinationMetric[];
  topRoutes: RouteMetric[];
  domesticTrips: number;
  domesticSpend: number;
  internationalTrips: number;
  internationalSpend: number;
}

export interface VendorSpendSummary {
  provider: string;
  totalSpend: number;
  bookingCount: number;
  avgBookingValue: number;
  travelModes: string[];
  shareOfSpend: number;
}

export interface EmployeeDetailedHistory {
  employeeIdentifier: string;
  employeeName: string;
  department: string;
  lifetimeSpend: number;
  lifetimeTrips: number;
  averageTripCost: number;
  firstTripDate?: string | null;
  lastTripDate?: string | null;
  topDestination: string;
  trips: ImportedRecordResponse[];
  monthlyTrend: MonthlySpendTrend[];
}

export interface CombinedSpendIntelligence {
  overview: ExecutiveSpendOverview;
  employees: EmployeeSpendSummary[];
  departments: DepartmentSpendSummary[];
  destinations: DestinationAnalysis;
  vendors: VendorSpendSummary[];
}

function buildSpendQuery(params?: SpendFilterParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.department) q.set("department", params.department);
  if (params.employeeId) q.set("employeeId", params.employeeId);
  if (params.provider) q.set("provider", params.provider);
  if (params.travelMode) q.set("travelMode", params.travelMode);
  if (params.financialYear) q.set("financialYear", params.financialYear);
  if (params.period) q.set("period", params.period);
  if (params.fromDate) q.set("fromDate", params.fromDate);
  if (params.toDate) q.set("toDate", params.toDate);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const spendReportsApi = {
  getCombined: async (params?: SpendFilterParams): Promise<CombinedSpendIntelligence> => {
    return await apiRequest<CombinedSpendIntelligence>(`/api/reports/spend/combined${buildSpendQuery(params)}`);
  },

  getOverview: async (params?: SpendFilterParams): Promise<ExecutiveSpendOverview> => {
    return await apiRequest<ExecutiveSpendOverview>(`/api/reports/spend/overview${buildSpendQuery(params)}`);
  },

  getEmployees: async (params?: SpendFilterParams): Promise<EmployeeSpendSummary[]> => {
    return await apiRequest<EmployeeSpendSummary[]>(`/api/reports/spend/employees${buildSpendQuery(params)}`);
  },

  getEmployeeDetail: async (identifier: string): Promise<EmployeeDetailedHistory> => {
    return await apiRequest<EmployeeDetailedHistory>(`/api/reports/spend/employee/${encodeURIComponent(identifier)}`);
  },

  getDepartments: async (params?: SpendFilterParams): Promise<DepartmentSpendSummary[]> => {
    return await apiRequest<DepartmentSpendSummary[]>(`/api/reports/spend/departments${buildSpendQuery(params)}`);
  },

  getDestinations: async (params?: SpendFilterParams): Promise<DestinationAnalysis> => {
    return await apiRequest<DestinationAnalysis>(`/api/reports/spend/destinations${buildSpendQuery(params)}`);
  },

  getVendors: async (params?: SpendFilterParams): Promise<VendorSpendSummary[]> => {
    return await apiRequest<VendorSpendSummary[]>(`/api/reports/spend/vendors${buildSpendQuery(params)}`);
  },

  getFilterDepartments: async (): Promise<string[]> => {
    return await apiRequest<string[]>("/api/reports/spend/filters/departments");
  },

  getFilterProviders: async (): Promise<string[]> => {
    return await apiRequest<string[]>("/api/reports/spend/filters/providers");
  },

  downloadReport: async (type = "EXECUTIVE_SUMMARY", params?: SpendFilterParams): Promise<void> => {
    const q = new URLSearchParams();
    q.set("type", type);
    if (params?.search) q.set("search", params.search);
    if (params?.department) q.set("department", params.department);
    if (params?.employeeId) q.set("employeeId", params.employeeId);
    if (params?.provider) q.set("provider", params.provider);
    if (params?.travelMode) q.set("travelMode", params.travelMode);
    if (params?.financialYear) q.set("financialYear", params.financialYear);
    if (params?.period) q.set("period", params.period);
    if (params?.fromDate) q.set("fromDate", params.fromDate);
    if (params?.toDate) q.set("toDate", params.toDate);

    const token = typeof window !== "undefined" ? (window.localStorage.getItem("trapple_token") || window.localStorage.getItem("travora_token")) : null;
    const res = await fetch(`${API_BASE_URL}/api/reports/spend/export?${q.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error("Failed to export spend report CSV.");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spend_report_${type.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};

export async function uploadDocument(file: File): Promise<{
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const token = typeof window !== "undefined" ? (window.localStorage.getItem("trapple_token") || window.localStorage.getItem("travora_token")) : null;
  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || "Failed to upload document to server.");
  }
  return await res.json();
}

export const API_CONFIG = { baseUrl: API_BASE_URL };

export type BackendExpense = {
  id: number;
  companyId?: number;
  companyName?: string;
  travelRequestId?: number | null;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  category: "FLIGHT" | "ACCOMMODATION" | "MEALS" | "TAXI" | "FUEL" | "OTHER";
  amount: number;
  currency: string;
  expenseDate: string;
  merchant: string;
  description?: string;
  receiptUrl?: string;
  receiptName?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REIMBURSED" | "REJECTED";
  approverName?: string;
  approvalComment?: string;
  approvedAt?: string;
  createdAt: string;
};

export const expenseApi = {
  getAll: async (status?: string): Promise<BackendExpense[]> => {
    const query = status && status !== "ALL" ? `?status=${status}` : "";
    return await apiRequest<BackendExpense[]>(`/api/expenses${query}`);
  },
  getById: async (id: number | string): Promise<BackendExpense> => {
    return await apiRequest<BackendExpense>(`/api/expenses/${id}`);
  },
  create: async (data: {
    travelRequestId?: number | null;
    category: string;
    amount: number;
    currency?: string;
    expenseDate: string;
    merchant: string;
    description?: string;
    receiptUrl?: string;
    receiptName?: string;
  }): Promise<BackendExpense> => {
    return await apiRequest<BackendExpense>("/api/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  approve: async (id: number | string, comment?: string): Promise<BackendExpense> => {
    return await apiRequest<BackendExpense>(`/api/expenses/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ comment: comment || "" }),
    });
  },
  reject: async (id: number | string, comment?: string): Promise<BackendExpense> => {
    return await apiRequest<BackendExpense>(`/api/expenses/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ comment: comment || "" }),
    });
  },
  reimburse: async (id: number | string): Promise<BackendExpense> => {
    return await apiRequest<BackendExpense>(`/api/expenses/${id}/reimburse`, {
      method: "PATCH",
    });
  },
  delete: async (id: number | string): Promise<void> => {
    await apiRequest(`/api/expenses/${id}`, { method: "DELETE" });
  },
};

export const companyApi = {
  getCurrent: async (): Promise<{ id: number; name: string; code: string; domain?: string; active: boolean }> => {
    return await apiRequest("/api/companies/current");
  },
  register: async (data: {
    name: string;
    code: string;
    domain?: string;
    adminUsername: string;
    adminPassword: string;
    adminEmail?: string;
  }): Promise<{ id: number; name: string; code: string; domain?: string; active: boolean }> => {
    return await apiRequest("/api/companies/register", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },
};

export type ManagedUser = {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  status: "ACTIVE" | "INACTIVE" | "PENDING_ACTIVATION";
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  companyId?: number | null;
  companyCode?: string | null;
  companyName?: string | null;
  createdAt?: string | null;
  hasPendingActivation?: boolean;
};

export type CreateManagedUserPayload = {
  name: string;
  email: string;
  employeeId?: string;
  department?: string;
  designation?: string;
  role: Role;
  active?: boolean;
  managerName?: string;
};

export type UpdateManagedUserPayload = {
  name?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  role?: Role;
  active?: boolean;
  managerName?: string;
};

export type CreatedUserResult = ManagedUser & {
  activationToken?: string;
  activationUrl?: string;
};

export type TokenVerificationResult = {
  valid: boolean;
  username?: string;
  name?: string;
  companyName?: string;
  message?: string;
};

export const usersApi = {
  list: async (params?: { search?: string; role?: string; status?: string }): Promise<ManagedUser[]> => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.role && params.role !== "ALL") q.set("role", params.role);
    if (params?.status && params.status !== "ALL") q.set("status", params.status);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return await apiRequest<ManagedUser[]>(`/api/users${qs}`);
  },
  get: async (id: number | string): Promise<ManagedUser> => {
    return await apiRequest<ManagedUser>(`/api/users/${id}`);
  },
  create: async (payload: CreateManagedUserPayload): Promise<CreatedUserResult> => {
    return await apiRequest<CreatedUserResult>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update: async (id: number | string, payload: UpdateManagedUserPayload): Promise<ManagedUser> => {
    return await apiRequest<ManagedUser>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  updateStatus: async (id: number | string, active: boolean): Promise<ManagedUser> => {
    return await apiRequest<ManagedUser>(`/api/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
  },
  resendActivation: async (id: number | string): Promise<CreatedUserResult> => {
    return await apiRequest<CreatedUserResult>(`/api/users/${id}/resend-activation`, {
      method: "POST",
    });
  },
  verifyToken: async (token: string): Promise<TokenVerificationResult> => {
    return await apiRequest<TokenVerificationResult>(`/api/auth/activate/verify?token=${encodeURIComponent(token)}`, {
      skipAuth: true,
    });
  },
  activate: async (token: string, password: string): Promise<{ message: string }> => {
    return await apiRequest<{ message: string }>("/api/auth/activate", {
      method: "POST",
      body: JSON.stringify({ token, password }),
      skipAuth: true,
    });
  },
};



