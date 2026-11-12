import type { Journey, BackendRequest } from "../types";

export function formatRequestDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function mapRequestStatus(status: string | undefined): Journey["status"] {
  const normalized = (status || "PENDING").toUpperCase();
  if (normalized === "APPROVED") return "Approved";
  if (normalized === "BOOKED") return "Booked";
  if (normalized === "CANCELLED") return "Cancelled";
  if (normalized === "REJECTED") return "Cancelled";
  if (normalized === "COMPLETED") return "Completed";
  return "Pending approval";
}

export function toJourney(request: BackendRequest): Journey {
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

export function formatNotificationTime(value: unknown) {
  if (!value) return "Just now";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
}

export function adminRequestStatus(value: unknown) {
  const normalized = String(value || "PENDING").toUpperCase();
  const labels: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", BOOKED: "Booked", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  return labels[normalized] || normalized.replaceAll("_", " ");
}

/** Same display format as formatRequestDate; kept as a named alias for admin views. */
export const adminRequestDate = formatRequestDate;

export function adminRequestSubmitted(request: Record<string, any>) {
  return request.createdAt || request.createdDate || request.submittedAt || request.submissionDate || request.requestDate || request.createdOn;
}

export function adminBookingStatus(booking: Record<string, any>) {
  if (booking.cancelled === true) return "Cancelled";
  return adminRequestStatus(booking.status || booking.travelRequest?.status || "BOOKED");
}

export function adminBookingDetails(booking: Record<string, any>) {
  const request = booking.travelRequest || {};
  const employee = request.employee || {};
  return [
    ["Booking ID", booking.id], ["Travel request ID", request.id], ["Employee", employee.name], ["Employee ID", employee.employeeId],
    ["Trip type", request.tripType], ["From", request.fromLocation], ["To", request.toLocation],
    ["Travel date", adminRequestDate(request.travelDate)], ["Return date", adminRequestDate(request.returnDate)],
    ["Project", request.projectName], ["Booking type", booking.bookingType], ["Provider", booking.provider],
    ["Reference / ticket", booking.bookingReference], ["Cost", booking.cost], ["Savings", booking.savings],
    ["Booked at", adminRequestDate(booking.bookedAt)], ["Cancellation reason", booking.cancellationReason],
    ["Cancellation charge", booking.cancellationCharge],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

export function reportCount<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length;
}

export function reportBarRows(values: Record<string, number>, limit = 6) {
  return Object.entries(values).sort(([, a], [, b]) => b - a).slice(0, limit);
}
