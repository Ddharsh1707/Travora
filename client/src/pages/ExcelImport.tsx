import { useState, useEffect, useRef, useMemo } from "react";
import {
  FileSpreadsheet,
  Upload,
  Download,
  Search,
  Filter,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ShieldCheck,
  Eye,
  Check,
  X,
  Layers,
  FileText,
  UsersRound,
  Plane,
  Building2,
  CalendarDays,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import {
  importsApi,
  employeesApi,
  type AuthUser,
  type EmployeeRecord,
  type ImportBatchResponse,
  type ImportedRecordResponse,
  type ImportResultResponse,
  type PaginatedResult,
} from "@/lib/api";
import {
  parseSpreadsheetClient,
  recoverFieldsFromRawRow,
  type ClientParsedSpreadsheet,
} from "@/lib/spreadsheetParser";

interface ExcelImportProps {
  user: AuthUser;
}

const FIELD_LABELS: Record<string, string> = {
  employeeId: "Employee ID / Code",
  employeeName: "Passenger / Full Name",
  firstName: "First Name / Given Name",
  lastName: "Last Name / Surname",
  travelDate: "Travel / Departure Date",
  returnDate: "Return Date",
  fromLocation: "Origin / From City",
  toLocation: "Destination / To City",
  sector: "Route / Sector (e.g. HYD-DEL)",
  ticketReference: "Ticket Number / PNR",
  department: "Department",
  travelMode: "Travel Mode (Flight/Train/Bus)",
  provider: "Carrier / Provider / Airline",
  cost: "Cost / Fare Amount",
  projectName: "Project Name / Cost Center",
};

/**
 * Normalizes airline/GDS and raw passenger names:
 * - DANGETI/SURESH BABU MR -> Suresh Babu Dangeti
 * - KUKREJA, ANIL -> Anil Kukreja
 * - Strip airline title honorifics (MR, MRS, MS, DR)
 * - Format with proper Title Casing
 */
function formatPassengerName(rawName?: string | null): string {
  if (!rawName) return "";
  let s = rawName.trim();
  const titles = ["MR", "MRS", "MS", "MISS", "MSTR", "MASTER", "DR", "PROF"];

  if (s.includes("/")) {
    const parts = s.split("/");
    const last = parts[0].trim();
    let first = parts.slice(1).join(" ").trim();
    const firstWords = first.split(/\s+/);
    if (firstWords.length > 1 && titles.includes(firstWords[firstWords.length - 1].replace(/\./g, "").toUpperCase())) {
      firstWords.pop();
      first = firstWords.join(" ");
    }
    s = `${first} ${last}`.trim();
  } else if (s.includes(",")) {
    const parts = s.split(",");
    const last = parts[0].trim();
    let first = parts.slice(1).join(" ").trim();
    const firstWords = first.split(/\s+/);
    if (firstWords.length > 1 && titles.includes(firstWords[firstWords.length - 1].replace(/\./g, "").toUpperCase())) {
      firstWords.pop();
      first = firstWords.join(" ");
    }
    s = `${first} ${last}`.trim();
  } else {
    const words = s.split(/\s+/);
    if (words.length > 1 && titles.includes(words[0].replace(/\./g, "").toUpperCase())) {
      words.shift();
      s = words.join(" ");
    }
    if (words.length > 1 && titles.includes(words[words.length - 1].replace(/\./g, "").toUpperCase())) {
      words.pop();
      s = words.join(" ");
    }
  }

  return s
    .split(/\s+/)
    .map((w) => (w.length === 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function getPassengerInitials(name?: string | null): string {
  if (!name || name === "—") return "PA";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "PA";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function ExcelImport({ user }: ExcelImportProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload");

  // Upload & Batch State
  const [currentBatch, setCurrentBatch] = useState<ImportBatchResponse | null>(null);
  const [recentBatches, setRecentBatches] = useState<ImportBatchResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enterprise SaaS Ingestion Refs (Client-side instant parsing + offline fallback)
  const clientParsedRef = useRef<ClientParsedSpreadsheet | null>(null);
  const currentFileRef = useRef<File | null>(null);
  const companyEmployeesRef = useRef<EmployeeRecord[]>([]);

  // Preview Records State
  const [previewRecords, setPreviewRecords] = useState<ImportedRecordResponse[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewTotalPages, setPreviewTotalPages] = useState(0);
  const [previewTotalElements, setPreviewTotalElements] = useState(0);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewStatusFilter, setPreviewStatusFilter] = useState("ALL");
  const [selectedRecord, setSelectedRecord] = useState<ImportedRecordResponse | null>(null);

  // Column Mapping Modal State
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [updatingMapping, setUpdatingMapping] = useState(false);

  // Import Confirmation State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultResponse | null>(null);

  // Travel History Search Tab State
  const [historyRecords, setHistoryRecords] = useState<ImportedRecordResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyTotalElements, setHistoryTotalElements] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);

  // Load recent batches
  const loadRecentBatches = async (autoSelectFirst = false) => {
    try {
      const data = await importsApi.listBatches({ page: 0, size: 10 });
      setRecentBatches(data?.content || []);
      if (autoSelectFirst && !currentBatch && data?.content && data.content.length > 0) {
        // Only auto-select if the batch has valid rows or was completed
        // Do not auto-display broken invalid preview batches on initial mount
        const first = data.content[0];
        if (first.validRows > 0 || first.status === "COMPLETED") {
          loadBatchDetails(first.id);
        }
      }
    } catch (err: any) {
      console.error("Failed to load batches:", err);
    }
  };

  useEffect(() => {
    loadRecentBatches(true);
    // Preload company employees to enable instant high-confidence matching in browser
    employeesApi
      .list({ size: 300 })
      .then((res) => {
        if (res?.content) {
          companyEmployeesRef.current = res.content;
        }
      })
      .catch((err) => console.warn("Could not preload employees for matching:", err));
  }, []);

  // Load batch details and records
  const loadBatchDetails = async (batchId: number) => {
    if (!batchId) return;
    setPreviewLoading(true);
    setUploadError("");
    try {
      const batch = await importsApi.getBatch(batchId);
      setCurrentBatch(batch);
      setColumnMapping(batch.columnMapping || batch.suggestedMapping || {});
      setPreviewPage(0);
      setPreviewSearch("");
      setPreviewStatusFilter("ALL");
      await fetchPreviewRecords(batch.id, 0, "", "ALL");
    } catch (err: any) {
      setUploadError(err.message || "Failed to load batch records.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const fetchPreviewRecords = async (batchId: number, page: number, search: string, status: string) => {
    setPreviewLoading(true);
    try {
      if (batchId > 0) {
        const data = await importsApi.getRecords(batchId, {
          page,
          size: 15,
          search: search.trim() || undefined,
          status: status !== "ALL" ? status : undefined,
        });

        // Merge backend records with client-parsed fallback OR recover from rawRowData
        const clientRecs = clientParsedRef.current?.records;
        const mergedContent = (data?.content || []).map((r, idx) => {
          const clientFallback = clientRecs ? clientRecs[idx + page * 15] : null;
          const recovered =
            !r.rawEmployeeName || !r.travelDate || !r.fromLocation
              ? recoverFieldsFromRawRow(r.rawRowData)
              : null;

          const rawEmployeeName =
            r.rawEmployeeName || clientFallback?.rawEmployeeName || recovered?.rawEmployeeName || null;
          const rawEmployeeIdentifier =
            r.rawEmployeeIdentifier ||
            clientFallback?.rawEmployeeIdentifier ||
            recovered?.rawEmployeeIdentifier ||
            null;
          const travelDate = r.travelDate || clientFallback?.travelDate || recovered?.travelDate || null;
          const fromLocation = r.fromLocation || clientFallback?.fromLocation || recovered?.fromLocation || null;
          const toLocation = r.toLocation || clientFallback?.toLocation || recovered?.toLocation || null;
          const ticketReference =
            r.ticketReference || clientFallback?.ticketReference || recovered?.ticketReference || null;
          const provider = r.provider || clientFallback?.provider || recovered?.provider || null;
          const cost =
            r.cost != null
              ? r.cost
              : clientFallback?.cost != null
              ? clientFallback.cost
              : recovered?.cost ?? null;

          const isValid = Boolean(rawEmployeeName && travelDate && fromLocation && toLocation);
          const status: ImportedRecordResponse["status"] =
            r.status !== "INVALID" ? r.status : isValid ? "VALID" : "INVALID";

          return {
            ...r,
            rawEmployeeName,
            rawEmployeeIdentifier,
            matchedEmployeeName: r.matchedEmployeeName || clientFallback?.matchedEmployeeName,
            matchedEmployeeCode: r.matchedEmployeeCode || clientFallback?.matchedEmployeeCode,
            travelDate,
            fromLocation,
            toLocation,
            ticketReference,
            provider,
            cost,
            status,
            validationErrors: isValid ? [] : r.validationErrors,
          };
        });

        setPreviewRecords(mergedContent);
        setPreviewTotalPages(data?.totalPages || 0);
        setPreviewTotalElements(data?.totalElements || 0);
      } else if (clientParsedRef.current) {
        // Local in-memory filtering and pagination
        const filtered = clientParsedRef.current.records.filter((r) => {
          if (status !== "ALL" && r.status !== status) return false;
          if (search) {
            const s = search.toLowerCase();
            const matchName = (r.rawEmployeeName || "").toLowerCase().includes(s);
            const matchEmpId = (r.rawEmployeeIdentifier || "").toLowerCase().includes(s);
            const matchRoute =
              (r.fromLocation || "").toLowerCase().includes(s) || (r.toLocation || "").toLowerCase().includes(s);
            const matchTkt = (r.ticketReference || "").toLowerCase().includes(s);
            return matchName || matchEmpId || matchRoute || matchTkt;
          }
          return true;
        });
        setPreviewRecords(filtered.slice(page * 15, (page + 1) * 15));
        setPreviewTotalElements(filtered.length);
        setPreviewTotalPages(Math.ceil(filtered.length / 15));
      }
    } catch (err: any) {
      if (clientParsedRef.current) {
        const slice = clientParsedRef.current.records.slice(page * 15, (page + 1) * 15);
        setPreviewRecords(slice);
        setPreviewTotalElements(clientParsedRef.current.totalRows);
        setPreviewTotalPages(Math.ceil(clientParsedRef.current.totalRows / 15));
      } else {
        toast.error(err.message || "Failed to load preview records.");
        setPreviewRecords([]);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  // Re-fetch preview records on page/search/filter change
  useEffect(() => {
    if (currentBatch) {
      fetchPreviewRecords(currentBatch.id, previewPage, previewSearch, previewStatusFilter);
    }
  }, [previewPage, previewStatusFilter]);

  // Handle File Upload: Instant Client-Side Parsing + Seamless Backend Synchronization
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    currentFileRef.current = file;
    setUploading(true);
    setUploadError("");

    try {
      // 1. Instant client-side parsing (Zero latency: table renders immediately!)
      const parsed = await parseSpreadsheetClient(file, {
        employees: companyEmployeesRef.current,
      });
      clientParsedRef.current = parsed;

      const initialBatch: ImportBatchResponse = {
        id: 0,
        filename: file.name,
        originalFilename: file.name,
        fileType: file.name.endsWith(".csv") ? "CSV" : "XLSX",
        sheetNames: parsed.sheetNames,
        selectedSheet: parsed.activeSheet,
        importType: "TRAVEL_HISTORY",
        status: "PREVIEW",
        totalRows: parsed.totalRows,
        validRows: parsed.validRows,
        importedRows: 0,
        skippedRows: 0,
        errorRows: parsed.errorRows,
        columnMapping: parsed.columnMapping,
        suggestedMapping: parsed.columnMapping,
        availableHeaders: parsed.availableHeaders,
        createdAt: new Date().toISOString(),
      };

      setCurrentBatch(initialBatch);
      setColumnMapping(parsed.columnMapping);
      setPreviewPage(0);
      setPreviewSearch("");
      setPreviewStatusFilter("ALL");
      setPreviewRecords(parsed.records.slice(0, 15));
      setPreviewTotalElements(parsed.totalRows);
      setPreviewTotalPages(Math.ceil(parsed.totalRows / 15));
      toast.success(`Spreadsheet loaded: ${parsed.totalRows} rows extracted`);

      // 2. Authoritative backend ingestion & synchronization
      try {
        let batch = await importsApi.upload(file);

        // If backend produced 0 valid rows because of header mismatch, auto-apply client mapping
        if (batch.validRows === 0 && parsed.validRows > 0) {
          try {
            const remapped = await importsApi.updateMapping(batch.id, parsed.columnMapping, batch.selectedSheet);
            batch = remapped;
          } catch (e) {
            console.warn("Auto-mapping update error:", e);
          }
        }

        setCurrentBatch({
          ...batch,
          availableHeaders:
            !batch.availableHeaders || batch.availableHeaders.includes("Column_2")
              ? parsed.availableHeaders
              : batch.availableHeaders,
          validRows: batch.validRows > 0 ? batch.validRows : parsed.validRows,
          errorRows: batch.validRows > 0 ? batch.errorRows : parsed.errorRows,
        });

        await fetchPreviewRecords(batch.id, 0, "", "ALL");
        await loadRecentBatches(false);
      } catch (apiErr: any) {
        console.warn("Backend upload error, maintaining client preview:", apiErr);
        toast.error(`Backend sync: ${apiErr.message || "Failed to reach server"}. Displaying local preview.`);
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to parse spreadsheet.");
      toast.error(err.message || "Spreadsheet upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle Updating Column Mapping
  const handleSaveMapping = async () => {
    if (!currentBatch) return;
    setUpdatingMapping(true);
    try {
      if (currentFileRef.current) {
        const reparsed = await parseSpreadsheetClient(currentFileRef.current, {
          customMapping: columnMapping,
          employees: companyEmployeesRef.current,
        });
        clientParsedRef.current = reparsed;
      }

      if (currentBatch.id > 0) {
        const updated = await importsApi.updateMapping(currentBatch.id, columnMapping, currentBatch.selectedSheet);
        setCurrentBatch({
          ...updated,
          availableHeaders:
            !updated.availableHeaders || updated.availableHeaders.includes("Column_2")
              ? clientParsedRef.current?.availableHeaders || updated.availableHeaders
              : updated.availableHeaders,
          validRows:
            updated.validRows > 0 ? updated.validRows : clientParsedRef.current?.validRows || updated.validRows,
          errorRows:
            updated.validRows > 0 ? updated.errorRows : clientParsedRef.current?.errorRows || updated.errorRows,
        });
      } else if (clientParsedRef.current) {
        setCurrentBatch((prev) =>
          prev
            ? {
                ...prev,
                columnMapping,
                validRows: clientParsedRef.current!.validRows,
                errorRows: clientParsedRef.current!.errorRows,
              }
            : null
        );
      }

      toast.success("Column mappings applied and rows re-evaluated");
      setMappingModalOpen(false);
      await fetchPreviewRecords(currentBatch.id, 0, previewSearch, previewStatusFilter);
    } catch (err: any) {
      toast.error(err.message || "Failed to update column mapping.");
    } finally {
      setUpdatingMapping(false);
    }
  };

  // Handle Confirm Import
  const handleConfirmImport = async () => {
    if (!currentBatch) return;
    setImporting(true);
    try {
      let batchId = currentBatch.id;
      // If batch was previewed locally and not yet synced to backend, upload now
      if (batchId === 0 && currentFileRef.current) {
        const uploaded = await importsApi.upload(currentFileRef.current);
        batchId = uploaded.id;
        if (columnMapping && Object.keys(columnMapping).length > 0) {
          try {
            await importsApi.updateMapping(batchId, columnMapping, uploaded.selectedSheet);
          } catch {}
        }
      }

      if (batchId > 0) {
        const result = await importsApi.confirm(batchId);
        setImportResult(result);
        setConfirmModalOpen(false);
        toast.success(`Successfully imported ${result.imported} travel records to database!`);
        loadBatchDetails(batchId);
        loadRecentBatches();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to complete import.");
    } finally {
      setImporting(false);
    }
  };

  // Travel History Search
  const fetchTravelHistory = async (page = 0) => {
    setHistoryLoading(true);
    try {
      const data = await importsApi.searchTravelHistory({
        page,
        size: 15,
        search: historySearch.trim() || undefined,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
      });
      setHistoryRecords(data.content);
      setHistoryTotalPages(data.totalPages);
      setHistoryTotalElements(data.totalElements);
      setHistoryPage(page);
    } catch (err: any) {
      toast.error(err.message || "Failed to load travel history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchTravelHistory(0);
    }
  }, [activeTab]);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      await importsApi.exportTravelHistory({
        search: historySearch.trim() || undefined,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
      });
      toast.success("Travel history CSV exported successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to export CSV.");
    } finally {
      setExportingCsv(false);
    }
  };

  const getStatusBadge = (status: string, matchConfidence?: string) => {
    switch (status) {
      case "MATCHED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
            <CheckCircle2 size={12} /> Matched
          </span>
        );
      case "VALID":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">
            <Check size={12} /> Valid
          </span>
        );
      case "IMPORTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25">
            <CheckCircle2 size={12} /> Imported
          </span>
        );
      case "DUPLICATE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
            <AlertTriangle size={12} /> Duplicate
          </span>
        );
      case "INVALID":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25">
            <XCircle size={12} /> Invalid
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/25">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="page-stack animate-page space-y-6">
      {/* 1. Header & Navigation Tabs */}
      <div className="page-heading flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-[#14B8A6]">
            <ShieldCheck size={14} /> Travel Desk Operations
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Excel Import & Travel History
          </h1>
          <p className="page-description text-sm text-[#94A3B8] mt-1">
            Upload company travel spreadsheets (.xlsx / .csv), inspect and search preview records, and import historical itineraries into the verified corporate archive.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "upload"
                ? "bg-[#0D9488] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Upload size={14} /> Spreadsheet Upload & Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "history"
                ? "bg-[#0D9488] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Layers size={14} /> Travel History Archive
          </button>
        </div>
      </div>

      {/* TAB 1: UPLOAD & PREVIEW */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          {/* Upload Drop Zone & Summary Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 panel table-panel p-6 flex flex-col justify-between">
              <div>
                <span className="card-kicker">INGESTION ENGINE</span>
                <h2 className="section-heading text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Upload Corporate Itinerary File
                </h2>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Supports Microsoft Excel (.xlsx) and comma-separated (.csv) files. Maximum file size is 20MB. Untrusted formulas are neutralized safely.
                </p>
              </div>

              <div className="mt-5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-xl p-6 text-center transition-colors bg-slate-50/60 dark:bg-slate-900/40 flex flex-col items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="excel-file-input"
                  disabled={uploading}
                />
                <div className="w-12 h-12 rounded-xl bg-[#14B8A6]/10 text-[#14B8A6] flex items-center justify-center mb-3">
                  <FileSpreadsheet size={24} />
                </div>
                <label
                  htmlFor="excel-file-input"
                  className="button button-primary cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
                >
                  <Upload size={16} /> {uploading ? "Analyzing spreadsheet…" : "Choose .xlsx or .csv File"}
                </label>
                <p className="text-[11px] text-[#64748B] mt-2">
                  Works with standard corporate travel desks, airline manifests, or travel agency export files.
                </p>
              </div>

              {uploadError && (
                <div role="alert" className="form-error-message mt-4 flex items-start justify-between gap-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                  <div className="flex items-start gap-2 min-w-0">
                    <XCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                    <span className="leading-relaxed break-words font-medium">{uploadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadError("")}
                    className="text-rose-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 p-0.5"
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Current Batch Info & Statistics Card */}
            <div className="panel table-panel p-6 flex flex-col justify-between">
              <div>
                <span className="card-kicker">ACTIVE BATCH</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {currentBatch ? currentBatch.originalFilename : "No File Loaded"}
                </h3>
                {currentBatch && (
                  <p className="text-xs text-[#94A3B8] mt-1 flex items-center gap-2">
                    <span>Format: {currentBatch.fileType}</span>
                    <span>•</span>
                    <span>Sheet: {currentBatch.selectedSheet || "Default"}</span>
                  </p>
                )}
              </div>

              {currentBatch ? (
                <div className="my-4 space-y-2">
                  <div className="flex justify-between items-center text-xs py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[#94A3B8]">Total Extracted</span>
                    <span className="font-bold text-slate-900 dark:text-white">{currentBatch.totalRows}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[#94A3B8]">Valid / Matched</span>
                    <span className="font-bold text-emerald-400">
                      {currentBatch.validRows > 0 ? currentBatch.validRows : clientParsedRef.current?.validRows || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[#94A3B8]">Validation Errors</span>
                    <span className="font-bold text-rose-400">
                      {currentBatch.validRows > 0 ? currentBatch.errorRows : clientParsedRef.current?.errorRows || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs py-1">
                    <span className="text-[#94A3B8]">Batch Status</span>
                    <span className="font-bold text-teal-400">{currentBatch.status}</span>
                  </div>

                  {currentBatch.status === "PREVIEW" && (
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-[11px] text-[#94A3B8] flex items-center gap-2">
                      <Clock3 size={14} className="text-[#14B8A6] shrink-0" />
                      <span>Preview mode active. Temporary data expires in 24 hours.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="my-8 text-center text-xs text-[#64748B]">
                  Select an Excel or CSV file to inspect columns and rows.
                </div>
              )}

              {currentBatch && currentBatch.status === "PREVIEW" && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setMappingModalOpen(true)}
                    className="button button-ghost flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    <SlidersHorizontal size={14} /> Map Columns
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={
                      (currentBatch.validRows > 0
                        ? currentBatch.validRows
                        : clientParsedRef.current?.validRows || 0) === 0
                    }
                    className="button button-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> Import (
                    {currentBatch.validRows > 0
                      ? currentBatch.validRows
                      : clientParsedRef.current?.validRows || 0}
                    )
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Import Result Banner */}
          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={24} className="text-emerald-400" />
                <div>
                  <h4 className="font-bold text-sm">Import Complete!</h4>
                  <p className="text-xs text-[#94A3B8]">
                    Successfully stored {importResult.imported} records in database. {importResult.skipped} duplicate records were skipped safely.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportResult(null);
                  setActiveTab("history");
                }}
                className="button button-primary py-1.5 px-4 text-xs"
              >
                View in Travel History →
              </button>
            </div>
          )}

          {/* Preview Table Panel */}
          {currentBatch && (
            <div className="panel table-panel">
              <div className="section-title-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="card-kicker">PREVIEW & SEARCH</span>
                  <h2 className="section-heading text-lg font-bold text-slate-900 dark:text-white">
                    Extracted Spreadsheet Rows
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#94A3B8]">
                    Showing {previewRecords?.length || 0} of {previewTotalElements || 0} rows
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchPreviewRecords(currentBatch.id, previewPage, previewSearch, previewStatusFilter)}
                    className="icon-button"
                    title="Reload preview"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>

              {/* Table Toolbar */}
              <div className="table-toolbar flex flex-wrap items-center gap-3 my-4">
                <div className="search-field flex items-center gap-2 flex-1 min-w-[240px] max-w-[340px]">
                  <Search size={15} />
                  <input
                    value={previewSearch}
                    onChange={(e) => {
                      setPreviewSearch(e.target.value);
                      fetchPreviewRecords(currentBatch.id, 0, e.target.value, previewStatusFilter);
                    }}
                    placeholder="Search passenger, employee ID, route, PNR…"
                  />
                  {previewSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewSearch("");
                        fetchPreviewRecords(currentBatch.id, 0, "", previewStatusFilter);
                      }}
                      className="icon-button"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="toolbar-filters flex items-center gap-2">
                  <Filter size={14} />
                  <select
                    value={previewStatusFilter}
                    onChange={(e) => {
                      setPreviewStatusFilter(e.target.value);
                      setPreviewPage(0);
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="MATCHED">Matched Employee</option>
                    <option value="VALID">Valid</option>
                    <option value="DUPLICATE">Duplicates</option>
                    <option value="INVALID">Validation Errors</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setMappingModalOpen(true)}
                  className="button button-ghost text-xs py-2 px-3 flex items-center gap-1.5 ml-auto"
                >
                  <SlidersHorizontal size={14} /> Modify Column Mapping
                </button>
              </div>

              {/* Responsive Table */}
              {previewLoading ? (
                <div className="py-16 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
                  <Clock3 size={18} className="animate-spin text-[#14B8A6]" />
                  <span>Loading spreadsheet preview…</span>
                </div>
              ) : previewRecords && previewRecords.length > 0 ? (
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Passenger / Employee</th>
                        <th>Employee ID</th>
                        <th>Travel Date</th>
                        <th>Route</th>
                        <th>Ticket / PNR</th>
                        <th>Cost</th>
                        <th>Match Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((r, rowIdx) => {
                        const clientFallback =
                          clientParsedRef.current?.records?.[r.sourceRowNumber - 2] ||
                          clientParsedRef.current?.records?.[rowIdx + previewPage * 15];
                        const recovered =
                          !r.rawEmployeeName || !r.travelDate || !r.fromLocation
                            ? recoverFieldsFromRawRow(r.rawRowData)
                            : null;
                        const rawName =
                          r.rawEmployeeName || clientFallback?.rawEmployeeName || recovered?.rawEmployeeName || "";
                        const formattedRaw = formatPassengerName(rawName);
                        const displayName =
                          r.matchedEmployeeName ||
                          clientFallback?.matchedEmployeeName ||
                          formattedRaw ||
                          rawName ||
                          "—";
                        const isMatched = Boolean(r.matchedEmployeeName || clientFallback?.matchedEmployeeName);
                        const showRawDifference =
                          isMatched &&
                          rawName &&
                          formattedRaw !== (r.matchedEmployeeName || clientFallback?.matchedEmployeeName);
                        const empCode =
                          r.matchedEmployeeCode ||
                          clientFallback?.matchedEmployeeCode ||
                          r.rawEmployeeIdentifier ||
                          clientFallback?.rawEmployeeIdentifier ||
                          recovered?.rawEmployeeIdentifier ||
                          "—";
                        const travelDate = r.travelDate || clientFallback?.travelDate || recovered?.travelDate || "—";
                        const fromLoc = r.fromLocation || clientFallback?.fromLocation || recovered?.fromLocation || "—";
                        const toLoc = r.toLocation || clientFallback?.toLocation || recovered?.toLocation || "—";
                        const ticketRef =
                          r.ticketReference || clientFallback?.ticketReference || recovered?.ticketReference || "—";
                        const costVal =
                          r.cost != null
                            ? r.cost
                            : clientFallback?.cost != null
                            ? clientFallback.cost
                            : recovered?.cost ?? null;
                        const rowStatus =
                          r.status !== "INVALID"
                            ? r.status
                            : clientFallback && clientFallback.status !== "INVALID"
                            ? clientFallback.status
                            : rawName && travelDate !== "—" && fromLoc !== "—" && toLoc !== "—"
                            ? "VALID"
                            : r.status;
                        const confidence = r.matchConfidence || clientFallback?.matchConfidence;

                        return (
                          <tr
                            key={r.id || rowIdx}
                            className="hover:bg-slate-100 dark:bg-slate-800/50 cursor-pointer"
                            onClick={() => setSelectedRecord(r)}
                          >
                            <td className="text-xs text-[#64748B]">{r.sourceRowNumber}</td>
                            <td>
                              <div className="table-journey">
                                <span className="avatar avatar-tiny">
                                  {getPassengerInitials(displayName)}
                                </span>
                                <span>
                                  <strong className="text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                    {displayName}
                                    {isMatched && (
                                      <span className="inline-flex items-center text-[10px] text-emerald-400 font-normal">
                                        <CheckCircle2 size={11} className="inline mr-0.5" /> Matched
                                      </span>
                                    )}
                                  </strong>
                                  {showRawDifference ? (
                                    <small className="text-[#94A3B8] text-[10px] block">
                                      File: {rawName}
                                    </small>
                                  ) : rawName && !isMatched && formattedRaw !== rawName ? (
                                    <small className="text-[#94A3B8] text-[10px] block">
                                      Raw: {rawName}
                                    </small>
                                  ) : null}
                                </span>
                              </div>
                            </td>
                            <td className="text-xs font-mono">
                              {r.matchedEmployeeCode || clientFallback?.matchedEmployeeCode ? (
                                <span className="text-emerald-400 font-bold">{empCode}</span>
                              ) : (
                                empCode
                              )}
                            </td>
                            <td className="text-xs text-slate-700 dark:text-slate-200">{travelDate}</td>
                            <td className="text-xs">
                              <span className="text-slate-800 dark:text-slate-200">{fromLoc}</span>
                              <span className="text-[#64748B] mx-1.5">→</span>
                              <span className="text-slate-800 dark:text-slate-200">{toLoc}</span>
                            </td>
                            <td className="text-xs font-mono text-[#94A3B8]">{ticketRef}</td>
                            <td className="text-xs font-semibold text-slate-900 dark:text-white">
                              {costVal != null ? `$${costVal}` : "—"}
                            </td>
                            <td>{getStatusBadge(rowStatus, confidence)}</td>
                            <td>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecord(r);
                                }}
                                className="icon-button"
                                title="Inspect row details"
                              >
                                <Eye size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state py-12 text-center">
                  <div className="empty-icon mx-auto mb-3">
                    <Search size={22} />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">No matching preview rows</h3>
                  <p className="text-xs text-[#94A3B8] max-w-sm mx-auto mt-1">
                    Try adjusting your search query or status filter to see other rows from this spreadsheet.
                  </p>
                </div>
              )}

              {/* Pagination Footer */}
              {previewTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-4 text-xs text-[#94A3B8]">
                  <span>
                    Page {previewPage + 1} of {previewTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={previewPage === 0}
                      onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                      className="button button-ghost py-1 px-3 disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={previewPage >= previewTotalPages - 1}
                      onClick={() => setPreviewPage((p) => p + 1)}
                      className="button button-ghost py-1 px-3 disabled:opacity-40"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRAVEL HISTORY ARCHIVE SEARCH */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="panel table-panel">
            <div className="section-title-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="card-kicker">HISTORICAL RECORDS</span>
                <h2 className="section-heading text-lg font-bold text-slate-900 dark:text-white">
                  Corporate Travel Archive Search
                </h2>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Query verified historical travel records imported across all batches for your organization.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exportingCsv || historyTotalElements === 0}
                className="button button-primary py-2 px-4 text-xs flex items-center gap-2 disabled:opacity-50"
              >
                <Download size={14} /> {exportingCsv ? "Exporting…" : "Export Filtered CSV"}
              </button>
            </div>

            {/* Filter Toolbar */}
            <div className="table-toolbar flex flex-wrap items-center gap-3 my-4">
              <div className="search-field flex items-center gap-2 flex-1 min-w-[260px]">
                <Search size={15} />
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by employee name, ID, route, ticket reference…"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8]">From:</span>
                <input
                  type="date"
                  value={historyFromDate}
                  onChange={(e) => setHistoryFromDate(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8]">To:</span>
                <input
                  type="date"
                  value={historyToDate}
                  onChange={(e) => setHistoryToDate(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <button
                type="button"
                onClick={() => fetchTravelHistory(0)}
                className="button button-primary py-1.5 px-4 text-xs"
              >
                Apply Filters
              </button>

              {(historySearch || historyFromDate || historyToDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setHistorySearch("");
                    setHistoryFromDate("");
                    setHistoryToDate("");
                    fetchTravelHistory(0);
                  }}
                  className="button button-ghost py-1.5 px-3 text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            {/* History Table */}
            {historyLoading ? (
              <div className="py-16 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
                <Clock3 size={18} className="animate-spin text-[#14B8A6]" />
                <span>Searching travel history…</span>
              </div>
            ) : historyRecords.length > 0 ? (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Passenger / Employee</th>
                      <th>Employee ID</th>
                      <th>Travel Date</th>
                      <th>Route</th>
                      <th>Ticket / PNR</th>
                      <th>Travel Mode</th>
                      <th>Carrier</th>
                      <th>Cost</th>
                      <th>Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRecords.map((r) => {
                      const formattedRaw = formatPassengerName(r.rawEmployeeName);
                      const displayName = r.matchedEmployeeName || formattedRaw || r.rawEmployeeName || "—";
                      return (
                        <tr key={r.id} className="hover:bg-slate-100 dark:bg-slate-800/50">
                          <td>
                            <div className="table-journey">
                              <span className="avatar avatar-tiny">
                                {getPassengerInitials(displayName)}
                              </span>
                              <span>
                                <strong className="text-slate-900 dark:text-white text-xs">
                                  {displayName}
                                </strong>
                                {r.matchedEmployeeName && (
                                  <small className="text-emerald-400 block">Verified: {r.matchedEmployeeName}</small>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="text-xs font-mono font-bold text-emerald-400">
                            {r.matchedEmployeeCode || r.rawEmployeeIdentifier || "—"}
                          </td>
                          <td className="text-xs text-slate-700 dark:text-slate-200">{r.travelDate || "—"}</td>
                          <td className="text-xs">
                            <span className="text-slate-800 dark:text-slate-200">{r.fromLocation || "—"}</span>
                            <span className="text-[#64748B] mx-1.5">→</span>
                            <span className="text-slate-800 dark:text-slate-200">{r.toLocation || "—"}</span>
                          </td>
                          <td className="text-xs font-mono text-[#94A3B8]">{r.ticketReference || "—"}</td>
                          <td className="text-xs text-[#94A3B8]">{r.travelMode || "FLIGHT"}</td>
                          <td className="text-xs text-[#94A3B8]">{r.provider || "—"}</td>
                          <td className="text-xs font-semibold text-slate-900 dark:text-white">
                            {r.cost != null ? `$${r.cost}` : "—"}
                          </td>
                          <td className="text-xs text-[#94A3B8]">{r.projectName || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state py-12 text-center">
                <div className="empty-icon mx-auto mb-3">
                  <Layers size={22} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">No historical travel records found</h3>
                <p className="text-xs text-[#94A3B8] max-w-sm mx-auto mt-1">
                  Upload and import spreadsheets in the "Spreadsheet Upload & Preview" tab to populate corporate travel history.
                </p>
              </div>
            )}

            {/* Pagination Footer */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-4 text-xs text-[#94A3B8]">
                <span>
                  Page {historyPage + 1} of {historyTotalPages} ({historyTotalElements} total records)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={historyPage === 0}
                    onClick={() => fetchTravelHistory(historyPage - 1)}
                    className="button button-ghost py-1 px-3 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    type="button"
                    disabled={historyPage >= historyTotalPages - 1}
                    onClick={() => fetchTravelHistory(historyPage + 1)}
                    className="button button-ghost py-1 px-3 disabled:opacity-40"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Column Mapping Modal */}
      {mappingModalOpen && currentBatch && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-2xl w-full">
            <button
              type="button"
              className="icon-button dialog-close"
              onClick={() => setMappingModalOpen(false)}
            >
              <X size={18} />
            </button>
            <div className="confirm-icon approve">
              <SlidersHorizontal size={22} />
            </div>
            <span className="card-kicker">COLUMN MAPPING CONFIGURATION</span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Map Spreadsheet Headers to Trapple Fields</h2>
            <p className="text-xs text-[#94A3B8] mt-1">
              Confirm which columns in your spreadsheet match the expected travel record properties.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6 max-h-[60vh] overflow-y-auto pr-2">
              {Object.entries(FIELD_LABELS).map(([fieldKey, fieldLabel]) => (
                <div key={fieldKey} className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <label className="block text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                    {fieldLabel}
                  </label>
                  <select
                    value={columnMapping[fieldKey] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setColumnMapping((prev) => ({
                        ...prev,
                        [fieldKey]: val,
                      }));
                    }}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">— Not Mapped —</option>
                    {(
                      !currentBatch.availableHeaders || currentBatch.availableHeaders.includes("Column_2")
                        ? clientParsedRef.current?.availableHeaders || currentBatch.availableHeaders || []
                        : currentBatch.availableHeaders
                    ).map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="dialog-actions flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="button button-ghost py-2 px-4 text-xs"
                onClick={() => setMappingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary py-2 px-5 text-xs flex items-center gap-2"
                onClick={handleSaveMapping}
                disabled={updatingMapping}
              >
                <Check size={14} /> {updatingMapping ? "Applying…" : "Apply Mappings & Re-evaluate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Import Confirmation Modal */}
      {confirmModalOpen && currentBatch && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-md w-full">
            <button
              type="button"
              className="icon-button dialog-close"
              onClick={() => setConfirmModalOpen(false)}
            >
              <X size={18} />
            </button>
            <div className="confirm-icon approve">
              <CheckCircle2 size={22} />
            </div>
            <span className="card-kicker">EXPLICIT CONFIRMATION</span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Confirm Travel Records Import</h2>
            <p className="text-xs text-[#94A3B8] mt-1">
              You are about to import historical travel data into the authoritative company database.
            </p>

            <div className="my-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Target Company:</span>
                <span className="font-bold text-slate-900 dark:text-white">{user.companyName || "Current Organization"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Records to Import:</span>
                <span className="font-bold text-emerald-400">{currentBatch.validRows} records</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Invalid / Error Rows:</span>
                <span className="font-bold text-rose-400">{currentBatch.errorRows} (will be skipped)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Duplicate Detection:</span>
                <span className="text-teal-400 font-semibold">Automatic Deduplication Active</span>
              </div>
            </div>

            <div className="dialog-actions flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="button button-ghost py-2 px-4 text-xs"
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary py-2 px-5 text-xs flex items-center gap-2"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                <Check size={14} /> {importing ? "Importing to database…" : "Confirm & Import to Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Row Inspector Modal */}
      {selectedRecord && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-dialog max-w-lg w-full">
            <button
              type="button"
              className="icon-button dialog-close"
              onClick={() => setSelectedRecord(null)}
            >
              <X size={18} />
            </button>
            <div className="confirm-icon approve">
              <Eye size={22} />
            </div>
            <span className="card-kicker">RECORD INSPECTOR</span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Row #{selectedRecord.sourceRowNumber} Details</h2>
            <div className="mt-1 flex items-center gap-2">
              {getStatusBadge(selectedRecord.status, selectedRecord.matchConfidence)}
              {selectedRecord.matchConfidence && (
                <span className="text-[10px] text-[#94A3B8] font-mono">
                  Confidence: {selectedRecord.matchConfidence}
                </span>
              )}
            </div>

            {selectedRecord.validationErrors && selectedRecord.validationErrors.length > 0 && (
              <div className="my-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle size={14} /> Validation Warnings:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {selectedRecord.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {(() => {
              const inspectorFallback =
                clientParsedRef.current?.records?.[selectedRecord.sourceRowNumber - 2] ||
                clientParsedRef.current?.records?.find((c) => c.sourceRowNumber === selectedRecord.sourceRowNumber);
              const rawName = selectedRecord.rawEmployeeName || inspectorFallback?.rawEmployeeName || "";
              const formattedRaw = formatPassengerName(rawName);
              const displayName =
                selectedRecord.matchedEmployeeName ||
                inspectorFallback?.matchedEmployeeName ||
                formattedRaw ||
                rawName ||
                "—";
              const empCode =
                selectedRecord.matchedEmployeeCode ||
                inspectorFallback?.matchedEmployeeCode ||
                selectedRecord.rawEmployeeIdentifier ||
                inspectorFallback?.rawEmployeeIdentifier ||
                "—";
              const travelDate = selectedRecord.travelDate || inspectorFallback?.travelDate || "—";
              const fromLoc = selectedRecord.fromLocation || inspectorFallback?.fromLocation || "—";
              const toLoc = selectedRecord.toLocation || inspectorFallback?.toLocation || "—";
              const ticketRef = selectedRecord.ticketReference || inspectorFallback?.ticketReference || "—";
              const costVal = selectedRecord.cost != null ? selectedRecord.cost : inspectorFallback?.cost;
              const providerVal = selectedRecord.provider || inspectorFallback?.provider || "—";

              return (
                <div className="my-4 grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Passenger Name</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{displayName}</span>
                    {rawName && (
                      <span className="text-[10px] text-[#64748B] block font-mono mt-0.5">
                        File: {rawName}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Employee ID</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{empCode}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Matched Employee</span>
                    <span className="font-semibold text-emerald-400">
                      {selectedRecord.matchedEmployeeName || inspectorFallback?.matchedEmployeeName
                        ? `${selectedRecord.matchedEmployeeName || inspectorFallback?.matchedEmployeeName} (${selectedRecord.matchedEmployeeCode || inspectorFallback?.matchedEmployeeCode || "Verified"})`
                        : "Unmatched"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Travel Date</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{travelDate}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">From Location</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{fromLoc}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">To Location</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{toLoc}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Ticket Reference / PNR</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{ticketRef}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Cost / Fare</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {costVal != null ? `$${costVal}` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Carrier / Provider</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{providerVal}</span>
                  </div>
                </div>
              );
            })()}

            <div className="dialog-actions flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="button button-primary py-2 px-5 text-xs"
                onClick={() => setSelectedRecord(null)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ExcelImport;

