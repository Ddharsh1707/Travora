import React, { useState, useMemo } from "react";
import { escapeHtml } from "../lib/safeHtml";
import { sanitizeCsvCell } from "../utils/exportCsv";
import { FileSpreadsheet, FileText, Download, Search, Filter, DollarSign, TrendingUp, TicketCheck, Plane, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { adminRequestDate } from "../utils/formatters";
import { type AuthUser, REGISTERED_EMPLOYEES } from "../lib/api";

function getUserDisplayName(user?: AuthUser | null): string {
  if (!user) return "Corporate User";
  if (user.employeeId) {
    const reg = REGISTERED_EMPLOYEES.find(
      (e) => e.employeeNumber.toLowerCase() === String(user.employeeId).toLowerCase()
    );
    if (reg) return reg.displayName;
  }
  return user.username || "Corporate User";
}

export interface UnifiedTravelRecord {
  id: string;
  requestId: string;
  bookingId?: string;
  pnr: string;
  employeeName: string;
  employeeId: string;
  department: string;
  tripType: string;
  fromLocation: string;
  toLocation: string;
  route: string;
  travelDate: string;
  returnDate: string;
  project: string;
  purpose: string;
  requestStatus: string;
  approverName: string;
  approvalDate: string;
  bookingType: "Flight" | "Hotel" | "Cab" | "Train" | "General";
  provider: string;
  cost: number;
  savings: number;
  bookedAt: string;
  isBooked: boolean;
  isCancelled: boolean;
}

interface ReportExtractionSuiteProps {
  requests: Array<Record<string, any>>;
  bookings: Array<Record<string, any>>;
  currentUser?: AuthUser | null;
  roleTitle?: string;
  compact?: boolean;
}

export function ReportExtractionSuite({
  requests,
  bookings,
  currentUser,
  roleTitle = "Corporate Travel Extraction",
  compact = false,
}: ReportExtractionSuiteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isExporting, setIsExporting] = useState(false);

  // Unify requests and bookings into rich, normalized extraction records
  const unifiedRecords: UnifiedTravelRecord[] = useMemo(() => {
    const list: UnifiedTravelRecord[] = [];
    const processedBookingIds = new Set<string>();

    // 1. Process all requests, matching bookings when available
    requests.forEach((req) => {
      const reqId = String(req.id || "");
      const employee = req.employee || {};
      const empName = employee.name || employee.username || getUserDisplayName(currentUser);
      const empId = employee.employeeId || currentUser?.employeeId || "MISPL-EMP";
      const dept = employee.department || "Operations & Projects";

      // Match booking for this request
      const matchedBooking = bookings.find(
        (b) => String(b.travelRequest?.id) === reqId || String(b.travelRequestId) === reqId
      );

      if (matchedBooking) {
        processedBookingIds.add(String(matchedBooking.id));
      }

      const costNum = matchedBooking ? Number(matchedBooking.cost) || 0 : 0;
      const savingsNum = matchedBooking ? Number(matchedBooking.savings) || 0 : 0;
      const bookingType = (matchedBooking?.bookingType || "Flight") as any;
      const pnr = matchedBooking?.bookingReference || (req.status === "BOOKED" ? "CONFIRMED" : "—");
      const provider = matchedBooking?.provider || (req.status === "BOOKED" ? "Corporate Carrier" : "—");

      list.push({
        id: `REC-${reqId}`,
        requestId: reqId,
        bookingId: matchedBooking ? String(matchedBooking.id) : undefined,
        pnr,
        employeeName: empName,
        employeeId: empId,
        department: dept,
        tripType: req.tripType || "Business",
        fromLocation: req.fromLocation || "Origin",
        toLocation: req.toLocation || "Destination",
        route: `${req.fromLocation || "—"} → ${req.toLocation || "—"}`,
        travelDate: req.travelDate ? String(req.travelDate) : "",
        returnDate: req.returnDate ? String(req.returnDate) : "",
        project: req.projectName || "Corporate Operations",
        purpose: req.reason || "Official Business Travel",
        requestStatus: String(req.status || "PENDING").toUpperCase(),
        approverName: req.approverName || "Approver Desk",
        approvalDate: req.approvalDate ? String(req.approvalDate) : "",
        bookingType,
        provider,
        cost: costNum,
        savings: savingsNum,
        bookedAt: matchedBooking?.bookedAt ? String(matchedBooking.bookedAt) : "",
        isBooked: Boolean(matchedBooking) || String(req.status).toUpperCase() === "BOOKED",
        isCancelled: matchedBooking?.cancelled === true || String(req.status).toUpperCase() === "CANCELLED",
      });
    });

    // 2. Add any standalone bookings not linked directly in requests array
    bookings.forEach((b) => {
      const bId = String(b.id || "");
      if (processedBookingIds.has(bId)) return;

      const req = b.travelRequest || {};
      const emp = req.employee || {};
      const costNum = Number(b.cost) || 0;

      list.push({
        id: `BK-${bId}`,
        requestId: req.id ? String(req.id) : `REQ-${bId}`,
        bookingId: bId,
        pnr: b.bookingReference || "CONFIRMED",
        employeeName: emp.name || getUserDisplayName(currentUser),
        employeeId: emp.employeeId || currentUser?.employeeId || "MISPL-EMP",
        department: emp.department || "Operations & Projects",
        tripType: req.tripType || b.bookingType || "Business",
        fromLocation: req.fromLocation || "—",
        toLocation: req.toLocation || "—",
        route: req.fromLocation && req.toLocation ? `${req.fromLocation} → ${req.toLocation}` : "Corporate Route",
        travelDate: req.travelDate ? String(req.travelDate) : "",
        returnDate: req.returnDate ? String(req.returnDate) : "",
        project: req.projectName || "Corporate Operations",
        purpose: req.reason || "Confirmed Corporate Booking",
        requestStatus: "BOOKED",
        approverName: req.approverName || "Direct Travel Desk",
        approvalDate: req.approvalDate ? String(req.approvalDate) : "",
        bookingType: (b.bookingType || "Flight") as any,
        provider: b.provider || "Approved Vendor",
        cost: costNum,
        savings: Number(b.savings) || 0,
        bookedAt: b.bookedAt ? String(b.bookedAt) : "",
        isBooked: true,
        isCancelled: b.cancelled === true,
      });
    });

    return list;
  }, [requests, bookings, currentUser]);

  // Aggregate Financial & Operations Totals
  const analytics = useMemo(() => {
    let totalSpend = 0;
    let flightSpend = 0;
    let hotelSpend = 0;
    let cabSpend = 0;
    let totalSavings = 0;
    let bookedCount = 0;
    let cancelledCount = 0;

    unifiedRecords.forEach((rec) => {
      if (!rec.isCancelled && rec.cost > 0) {
        totalSpend += rec.cost;
        totalSavings += rec.savings;
        if (rec.bookingType === "Flight") flightSpend += rec.cost;
        else if (rec.bookingType === "Hotel") hotelSpend += rec.cost;
        else if (rec.bookingType === "Cab") cabSpend += rec.cost;
        else flightSpend += rec.cost; // Default fallback
      }
      if (rec.isBooked && !rec.isCancelled) bookedCount += 1;
      if (rec.isCancelled) cancelledCount += 1;
    });

    const averageCost = bookedCount > 0 ? totalSpend / bookedCount : 0;

    return {
      totalSpend,
      averageCost,
      flightSpend,
      hotelSpend,
      cabSpend,
      totalSavings,
      bookedCount,
      cancelledCount,
      totalRequests: requests.length,
      pendingCount: requests.filter((r) => String(r.status).toUpperCase() === "PENDING").length,
      approvedCount: requests.filter((r) => String(r.status).toUpperCase() === "APPROVED").length,
    };
  }, [unifiedRecords, requests]);

  // Filtered rows for the live view
  const filteredRecords = useMemo(() => {
    return unifiedRecords.filter((rec) => {
      const matchSearch =
        searchQuery === "" ||
        [
          rec.employeeName,
          rec.employeeId,
          rec.project,
          rec.route,
          rec.fromLocation,
          rec.toLocation,
          rec.pnr,
          rec.provider,
          rec.requestId,
          rec.department,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchCategory =
        categoryFilter === "ALL" ||
        rec.bookingType.toUpperCase() === categoryFilter.toUpperCase();

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "BOOKED" && rec.isBooked && !rec.isCancelled) ||
        (statusFilter === "PENDING" && rec.requestStatus === "PENDING") ||
        (statusFilter === "APPROVED" && rec.requestStatus === "APPROVED") ||
        (statusFilter === "CANCELLED" && rec.isCancelled);

      return matchSearch && matchCategory && matchStatus;
    });
  }, [unifiedRecords, searchQuery, categoryFilter, statusFilter]);

  // Currency Formatter (Indian Rupee INR)
  const formatINR = (val: number) => {
    return `₹${Math.round(val).toLocaleString("en-IN")}`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EXPORT TO EXCEL / CSV WITH UTF-8 BOM
  // ─────────────────────────────────────────────────────────────────────────────
  const exportToExcelCSV = () => {
    try {
      setIsExporting(true);
      const now = new Date();
      const timestamp = now.toISOString().replace(/T/, " ").replace(/\..+/, "");
      const dateTag = now.toISOString().slice(0, 10);

      // Quotes every cell and stops spreadsheet formulas (=, +, -, @) planted in names or notes.
      const escapeCSV = sanitizeCsvCell;

      // Header and KPI Summary Rows
      const lines: string[] = [];
      lines.push(escapeCSV("MAHATHI INFRA SERVICES PVT. LTD. - TRAVEL & BOOKINGS EXTRACTION REPORT"));
      lines.push(`${escapeCSV("Generated At:")},${escapeCSV(timestamp)}`);
      lines.push(`${escapeCSV("Generated By:")},${escapeCSV(`${escapeHtml(getUserDisplayName(currentUser))} (${escapeHtml(currentUser?.role || "PORTAL")})`)}`);
      lines.push(`${escapeCSV("Corporate Entity:")},${escapeCSV("Mahathi Infra Services Pvt. Ltd. (HQ: Bengaluru)")}`);
      lines.push(`${escapeCSV("Report Scope:")},${escapeCSV(roleTitle)}`);
      lines.push("");
      lines.push(escapeCSV("EXECUTIVE FINANCIAL & OPERATIONAL SUMMARY"));
      lines.push(`${escapeCSV("Total Bookings Cost (Spend):")},${escapeCSV(formatINR(analytics.totalSpend))},${escapeCSV("Total Bookings Count:")},${escapeCSV(analytics.bookedCount)}`);
      lines.push(`${escapeCSV("Average Booking Cost:")},${escapeCSV(formatINR(analytics.averageCost))},${escapeCSV("Total Travel Requests:")},${escapeCSV(analytics.totalRequests)}`);
      lines.push(`${escapeCSV("Air Corridors Spend (Flights):")},${escapeCSV(formatINR(analytics.flightSpend))},${escapeCSV("Pending Approvals:")},${escapeCSV(analytics.pendingCount)}`);
      lines.push(`${escapeCSV("Accommodations Spend (Hotels):")},${escapeCSV(formatINR(analytics.hotelSpend))},${escapeCSV("Approved Trips:")},${escapeCSV(analytics.approvedCount)}`);
      lines.push(`${escapeCSV("Ground Transit Spend (Cabs):")},${escapeCSV(formatINR(analytics.cabSpend))},${escapeCSV("Total Corporate Savings:")},${escapeCSV(formatINR(analytics.totalSavings))}`);
      lines.push("");
      lines.push(escapeCSV("DETAILED ITEMIZED TRAVEL & BOOKINGS MANIFEST"));

      // Column Headers (22 columns)
      const headers = [
        "Record ID",
        "Request ID",
        "Booking ID",
        "PNR / Reference",
        "Employee Name",
        "Employee ID",
        "Department",
        "Trip Type",
        "Origin (From)",
        "Destination (To)",
        "Travel Date",
        "Return Date",
        "Project / Cost Center",
        "Business Purpose",
        "Request Status",
        "Approver",
        "Approval Date",
        "Booking Category",
        "Travel Provider",
        "Cost (INR)",
        "Booking Status",
        "Booked Timestamp",
      ];
      lines.push(headers.map(escapeCSV).join(","));

      // Data Rows
      unifiedRecords.forEach((rec) => {
        const row = [
          rec.id,
          rec.requestId,
          rec.bookingId || "—",
          rec.pnr,
          rec.employeeName,
          rec.employeeId,
          rec.department,
          rec.tripType,
          rec.fromLocation,
          rec.toLocation,
          adminRequestDate(rec.travelDate),
          adminRequestDate(rec.returnDate),
          rec.project,
          rec.purpose,
          rec.requestStatus,
          rec.approverName,
          adminRequestDate(rec.approvalDate),
          rec.bookingType,
          rec.provider,
          rec.cost > 0 ? rec.cost : 0,
          rec.isCancelled ? "Cancelled" : rec.isBooked ? "Confirmed" : "Pending Booking",
          rec.bookedAt ? adminRequestDate(rec.bookedAt) : "—",
        ];
        lines.push(row.map(escapeCSV).join(","));
      });

      // Add UTF-8 BOM so Excel opens with proper encoding
      const csvContent = "\uFEFF" + lines.join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Trapple_Travel_Bookings_Report_${dateTag}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Excel / CSV report exported successfully!", {
        description: `Downloaded ${unifiedRecords.length} records with overall cost totals.`,
      });
    } catch (err) {
      toast.error("Failed to generate Excel export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. EXPORT TO PDF (EXECUTIVE BRANDED PRINT-TO-PDF)
  // ─────────────────────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    try {
      setIsExporting(true);
      const now = new Date();
      const reportDate = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(now);
      const reportId = `TRP-EXP-${Math.floor(Math.random() * 900000 + 100000)}`;

      // Build printable HTML string
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Pop-up was blocked. Please allow pop-ups to generate PDF report.");
        return;
      }

      const rowsHtml = unifiedRecords
        .map(
          (rec, idx) => `
        <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; font-weight: 600; color: #0f172a;">${escapeHtml(rec.requestId)}</td>
          <td style="padding: 10px 8px; font-family: monospace; font-size: 11px; color: #0284c7; font-weight: 600;">${escapeHtml(rec.pnr)}</td>
          <td style="padding: 10px 8px;">
            <div style="font-weight: 600; color: #1e293b;">${escapeHtml(rec.employeeName)}</div>
            <div style="font-size: 10px; color: #64748b;">${escapeHtml(rec.employeeId)} · ${escapeHtml(rec.department)}</div>
          </td>
          <td style="padding: 10px 8px; font-weight: 500;">${escapeHtml(rec.route)}</td>
          <td style="padding: 10px 8px; font-size: 11px; color: #475467;">${escapeHtml(adminRequestDate(rec.travelDate))}</td>
          <td style="padding: 10px 8px; font-size: 11px; color: #334155;">${escapeHtml(rec.project)}</td>
          <td style="padding: 10px 8px; font-size: 11px;">
            <span style="font-weight: 600;">${escapeHtml(rec.bookingType)}</span>
            <div style="font-size: 10px; color: #64748b;">${escapeHtml(rec.provider)}</div>
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; ${
              rec.isCancelled
                ? "background: #fee2e2; color: #991b1b;"
                : rec.isBooked
                ? "background: #dcfce7; color: #166534;"
                : "background: #fef3c7; color: #92400e;"
            }">
              ${rec.isCancelled ? "Cancelled" : rec.isBooked ? "Confirmed" : escapeHtml(rec.requestStatus)}
            </span>
          </td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 700; font-size: 12px; color: ${
            rec.cost > 0 ? "#0f172a" : "#64748b"
          };">
            ${rec.cost > 0 ? formatINR(rec.cost) : "—"}
          </td>
        </tr>
      `
        )
        .join("");

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Trapple Executive Travel & Bookings Report - ${reportId}</title>
            <meta charset="utf-8" />
            <style>
              @page {
                size: A4 landscape;
                margin: 12mm;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #0f172a;
                margin: 0;
                padding: 15px;
                background: #ffffff;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #E8961C;
                padding-bottom: 16px;
                margin-bottom: 20px;
              }
              .logo-title h1 {
                margin: 0;
                font-size: 22px;
                font-weight: 800;
                color: #0f172a;
                letter-spacing: -0.5px;
              }
              .logo-title p {
                margin: 4px 0 0;
                font-size: 12px;
                color: #E8961C;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .report-meta {
                text-align: right;
                font-size: 11px;
                color: #475467;
              }
              .report-meta strong {
                color: #0f172a;
              }
              .kpi-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-bottom: 24px;
              }
              .kpi-card {
                padding: 14px 16px;
                border-radius: 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
              }
              .kpi-card small {
                display: block;
                font-size: 10px;
                font-weight: 700;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .kpi-card strong {
                display: block;
                font-size: 22px;
                font-weight: 800;
                color: #0f172a;
                margin-top: 4px;
              }
              .kpi-card span {
                font-size: 11px;
                color: #E8961C;
                font-weight: 600;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
                text-align: left;
                margin-top: 10px;
              }
              th {
                background: #0f172a;
                color: #ffffff;
                padding: 10px 8px;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .footer {
                margin-top: 30px;
                border-top: 1px solid #e2e8f0;
                padding-top: 15px;
                display: flex;
                justify-content: space-between;
                font-size: 10px;
                color: #64748b;
              }
              .sign-box {
                margin-top: 20px;
                display: flex;
                justify-content: flex-end;
                gap: 50px;
              }
              .sign-line {
                text-align: center;
                border-top: 1px solid #94a3b8;
                padding-top: 5px;
                min-width: 180px;
                font-size: 10px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo-title">
                <h1>MAHATHI INFRA SERVICES PVT. LTD.</h1>
                <p>Trapple Corporate Travel Management — Official Financial & Booking Extraction</p>
              </div>
              <div class="report-meta">
                <div>Report Reference: <strong>${reportId}</strong></div>
                <div>Extraction Date: <strong>${reportDate}</strong></div>
                <div>Extracted By: <strong>${escapeHtml(getUserDisplayName(currentUser))} (${escapeHtml(currentUser?.role || "PORTAL")})</strong></div>
                <div>Classification: <strong style="color: #E8961C;">CONFIDENTIAL / CORPORATE AUDIT</strong></div>
              </div>
            </div>

            <div class="kpi-grid">
              <div class="kpi-card" style="border-left: 4px solid #E8961C;">
                <small>Total Travel Spend</small>
                <strong style="color: #E8961C;">${formatINR(analytics.totalSpend)}</strong>
                <span>${analytics.bookedCount} Confirmed Bookings</span>
              </div>
              <div class="kpi-card" style="border-left: 4px solid #0284c7;">
                <small>Average Booking Cost</small>
                <strong>${formatINR(analytics.averageCost)}</strong>
                <span>Air + Hotel + Ground</span>
              </div>
              <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
                <small>Category Allocation</small>
                <strong style="font-size: 16px; margin-top: 8px;">
                  Air: ${formatINR(analytics.flightSpend)}
                </strong>
                <span style="font-size: 10px; color: #64748b;">
                  Hotel: ${formatINR(analytics.hotelSpend)} · Cab: ${formatINR(analytics.cabSpend)}
                </span>
              </div>
              <div class="kpi-card" style="border-left: 4px solid #10b981;">
                <small>Requests & Compliance</small>
                <strong>${analytics.totalRequests} Trips</strong>
                <span>${analytics.approvedCount} Approved · ${analytics.pendingCount} Pending</span>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Req #</th>
                  <th>PNR Ref</th>
                  <th>Employee / Dept</th>
                  <th>Route</th>
                  <th>Travel Date</th>
                  <th>Project / Center</th>
                  <th>Category</th>
                  <th style="text-align: center;">Status</th>
                  <th style="text-align: right;">Cost (INR)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="sign-box">
              <div class="sign-line">
                <strong>Prepared & Extracted By</strong><br />
                ${escapeHtml(getUserDisplayName(currentUser))}<br />
                <span style="font-size: 9px; color: #94a3b8;">${reportDate}</span>
              </div>
              <div class="sign-line">
                <strong>Authorized Signatory / Finance Desk</strong><br />
                Mahathi Infra Services Pvt. Ltd.<br />
                <span style="font-size: 9px; color: #94a3b8;">Corporate Audit Verified</span>
              </div>
            </div>

            <div class="footer">
              <div>Trapple Cloud Enterprise v2.4 · Mahathi Infra Services Pvt. Ltd. Confidential</div>
              <div>Page 1 of 1 · Generated automatically from verified JWT database records</div>
            </div>

          </body>
        </html>
      `);
      printWindow.document.close();
      // Printed from here, not from an inline script, so the CSP can block inline scripts.
      setTimeout(() => printWindow.print(), 350);
      toast.success("Executive PDF report generated!", {
        description: "Your browser print-to-PDF dialog has opened.",
      });
    } catch (err) {
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. EXPORT TO JSON
  // ─────────────────────────────────────────────────────────────────────────────
  const exportToJSON = () => {
    try {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(
          JSON.stringify(
            {
              company: "Mahathi Infra Services Pvt. Ltd.",
              portal: "Trapple Corporate Travel Management",
              generatedAt: new Date().toISOString(),
              generatedBy: currentUser,
              summary: analytics,
              records: unifiedRecords,
            },
            null,
            2
          )
        );
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute(
        "download",
        `Trapple_Travel_Extraction_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success("JSON data extracted successfully!");
    } catch {
      toast.error("Failed to extract JSON.");
    }
  };

  return (
    <div className="panel space-y-5 p-5 md:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E7EC] dark:border-[#1E293B] shadow-sm">
      {/* Executive Header & Export Action Hub */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#E4E7EC] dark:border-[#1E293B]">
        <div>
          <div className="flex items-center gap-2">
            <span className="card-kicker">FINANCIAL & OPERATIONS INTELLIGENCE</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F2A93B]/10 text-[#E8961C] dark:text-[#F6BC55] border border-[#F2A93B]/20">
              <ShieldCheck size={12} /> Audit Verified
            </span>
          </div>
          <h2 className="section-heading text-xl md:text-2xl mt-1 flex items-center gap-2">
            <TrendingUp size={22} className="text-[#F2A93B]" /> Overall Bookings Cost & Travel Extraction
          </h2>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-0.5 max-w-2xl">
            Extract complete cost breakdowns, employee manifests, and ticket PNRs across Mahathi Infra corporate travel operations in ready-to-use Excel or PDF formats.
          </p>
        </div>

        {/* Primary Export Actions */}
        <div className="flex items-center gap-2.5 flex-wrap w-full lg:w-auto">
          <button
            type="button"
            onClick={exportToExcelCSV}
            disabled={isExporting}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all shadow-sm active:scale-95"
            title="Download formatted spreadsheet for Excel or Google Sheets"
          >
            <FileSpreadsheet size={16} />
            <span>Export to Excel (.csv)</span>
          </button>

          <button
            type="button"
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F172A] dark:bg-white text-white dark:text-[#0F172A] hover:bg-slate-800 dark:hover:bg-slate-100 font-semibold text-xs transition-all shadow-sm active:scale-95"
            title="Download official corporate executive PDF report with letterhead"
          >
            <FileText size={16} />
            <span>Download PDF Report</span>
          </button>

          <button
            type="button"
            onClick={exportToJSON}
            className="inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all text-xs font-semibold"
            title="Export raw JSON dataset"
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Financial Overview KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total Spend */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-200/60 dark:border-emerald-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
              Total Travel Spend
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-emerald-950 dark:text-emerald-100 mt-2 font-mono">
            {formatINR(analytics.totalSpend)}
          </div>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 size={12} /> {analytics.bookedCount} confirmed bookings
          </p>
        </div>

        {/* Avg Booking Cost */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 border border-blue-200/60 dark:border-blue-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider">
              Avg Cost / Trip
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-blue-950 dark:text-blue-100 mt-2 font-mono">
            {formatINR(analytics.averageCost)}
          </div>
          <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
            Air + Accommodations
          </p>
        </div>

        {/* Flight & Hotel Split */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/10 border border-amber-200/60 dark:border-amber-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
              Flights vs Hotels
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Plane size={16} />
            </div>
          </div>
          <div className="text-base md:text-lg font-bold text-amber-950 dark:text-amber-100 mt-2 font-mono flex items-center gap-2">
            <span>✈ {formatINR(analytics.flightSpend)}</span>
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 font-medium">
            🏨 Hotel: {formatINR(analytics.hotelSpend)} · 🚕 Cab: {formatINR(analytics.cabSpend)}
          </p>
        </div>

        {/* Total Trips */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50/40 dark:from-purple-950/20 dark:to-pink-950/10 border border-purple-200/60 dark:border-purple-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-800 dark:text-purple-400 uppercase tracking-wider">
              Trips & Requests
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <TicketCheck size={16} />
            </div>
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-purple-950 dark:text-purple-100 mt-2">
            {analytics.totalRequests} Requests
          </div>
          <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-1 font-medium">
            {analytics.approvedCount} approved · {analytics.pendingCount} pending
          </p>
        </div>
      </div>

      {/* Filter & Live Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee, PNR, project or destination..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F2A93B]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Category Filter */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            <Filter size={13} className="text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent border-none text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="FLIGHT">Flights</option>
              <option value="HOTEL">Hotels</option>
              <option value="CAB">Cabs / Transit</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="BOOKED">Confirmed Bookings</option>
              <option value="APPROVED">Approved Trips</option>
              <option value="PENDING">Pending Approval</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <span className="text-[11px] text-slate-500 font-medium ml-1">
            {filteredRecords.length} of {unifiedRecords.length} records
          </span>
        </div>
      </div>

      {/* Itemized Table of Extracted Travel Records */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <th className="py-3 px-3.5">Req #</th>
              <th className="py-3 px-3.5">PNR / Ref</th>
              <th className="py-3 px-3.5">Employee</th>
              <th className="py-3 px-3.5">Route</th>
              <th className="py-3 px-3.5">Date</th>
              <th className="py-3 px-3.5">Project</th>
              <th className="py-3 px-3.5">Type & Vendor</th>
              <th className="py-3 px-3.5 text-center">Status</th>
              <th className="py-3 px-3.5 text-right">Cost (INR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  No travel or booking records match your search query.
                </td>
              </tr>
            ) : (
              filteredRecords.slice(0, 15).map((rec) => (
                <tr
                  key={rec.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">
                    {rec.requestId}
                  </td>
                  <td className="py-3 px-3.5 font-mono text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                    {rec.pnr}
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {rec.employeeName}
                    </div>
                    <div className="text-[10px] text-slate-500">{rec.employeeId}</div>
                  </td>
                  <td className="py-3 px-3.5 font-medium text-slate-700 dark:text-slate-300">
                    {rec.route}
                  </td>
                  <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                    {adminRequestDate(rec.travelDate)}
                  </td>
                  <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300 font-medium">
                    {rec.project}
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {rec.bookingType}
                    </div>
                    <div className="text-[10px] text-slate-500">{rec.provider}</div>
                  </td>
                  <td className="py-3 px-3.5 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rec.isCancelled
                          ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400"
                          : rec.isBooked
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : rec.requestStatus === "APPROVED"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                      }`}
                    >
                      {rec.isCancelled
                        ? "Cancelled"
                        : rec.isBooked
                        ? "Confirmed"
                        : escapeHtml(rec.requestStatus)}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {rec.cost > 0 ? formatINR(rec.cost) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredRecords.length > 15 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>Showing first 15 of {filteredRecords.length} records in preview.</span>
          <span className="font-medium text-[#F2A93B]">
            Export to Excel or PDF to extract complete archive ({filteredRecords.length} records).
          </span>
        </div>
      )}
    </div>
  );
}
