package com.traveldesk.backend.importdata;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.employee.Employee;
import com.traveldesk.backend.employee.EmployeeRepository;
import com.traveldesk.backend.employee.ImportedPassengerAlias;
import com.traveldesk.backend.employee.ImportedPassengerAliasRepository;
import com.traveldesk.backend.journey.JourneyAggregationService;
import com.traveldesk.backend.project.Project;
import com.traveldesk.backend.project.ProjectRepository;
import com.traveldesk.backend.project.TravelRecordProjectAllocation;
import com.traveldesk.backend.project.TravelRecordProjectAllocationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final ImportBatchRepository batchRepository;
    private final ImportedTravelRecordRepository recordRepository;
    private final EmployeeRepository employeeRepository;
    private final SpreadsheetParserService parserService;
    private final ProjectRepository projectRepository;
    private final TravelRecordProjectAllocationRepository allocationRepository;
    private final ImportedPassengerAliasRepository aliasRepository;
    private final JourneyAggregationService journeyAggregationService;

    // Common international airport/city indicators
    private static final Set<String> INTERNATIONAL_INDICATORS = Set.of(
            "DUBAI", "DXB", "SINGAPORE", "SIN", "LONDON", "LHR", "LGW", "NEW YORK", "JFK",
            "DOHA", "DOH", "ABU DHABI", "AUH", "BANGKOK", "BKK", "KUALA LUMPUR", "KUL",
            "FRANKFURT", "FRA", "PARIS", "CDG", "TOKYO", "NRT", "HND", "HONG KONG", "HKG",
            "COLOMBO", "CMB", "DHAKA", "DAC", "KATHMANDU", "KTM", "MUSCAT", "MCT",
            "BAHRAIN", "BAH", "KUWAIT", "KWI", "RIYADH", "RUH", "JEDDAH", "JED",
            "SYDNEY", "SYD", "MELBOURNE", "MEL", "TORONTO", "YYZ", "CHICAGO", "ORD",
            "SAN FRANCISCO", "SFO", "DALLAS", "DFW", "AMSTERDAM", "AMS", "ZURICH", "ZRH",
            "ROB", "MONROVIA", "LIBERIA", "MAURITIUS", "MRU", "BUCHANAN", "THOKADEH"
    );

    @Autowired
    public ImportService(
            ImportBatchRepository batchRepository,
            ImportedTravelRecordRepository recordRepository,
            EmployeeRepository employeeRepository,
            SpreadsheetParserService parserService,
            ProjectRepository projectRepository,
            TravelRecordProjectAllocationRepository allocationRepository,
            ImportedPassengerAliasRepository aliasRepository,
            JourneyAggregationService journeyAggregationService
    ) {
        this.batchRepository = batchRepository;
        this.recordRepository = recordRepository;
        this.employeeRepository = employeeRepository;
        this.parserService = parserService;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.aliasRepository = aliasRepository;
        this.journeyAggregationService = journeyAggregationService;
    }

    public ImportService(
            ImportBatchRepository batchRepository,
            ImportedTravelRecordRepository recordRepository,
            EmployeeRepository employeeRepository,
            SpreadsheetParserService parserService
    ) {
        this(batchRepository, recordRepository, employeeRepository, parserService, null, null, null, null);
    }

    private Company getRequiredCompany(User currentUser) {
        if (currentUser == null || currentUser.getCompany() == null) {
            throw new IllegalArgumentException("User account is not associated with an active company tenant.");
        }
        return currentUser.getCompany();
    }

    private Long getRequiredCompanyId(User currentUser) {
        return getRequiredCompany(currentUser).getId();
    }

    /**
     * Upload and parse an Excel or CSV file into a PREVIEW batch.
     */
    @Transactional
    public ImportBatchResponse uploadAndPreview(MultipartFile file, String targetSheet, User currentUser) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("The uploaded file is empty. Please select a valid spreadsheet with data.");
        }

        Company company = getRequiredCompany(currentUser);

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            originalFilename = "uploaded_file";
        }

        String fileType;
        if (originalFilename.toLowerCase().endsWith(".xlsx")) {
            fileType = "XLSX";
        } else if (originalFilename.toLowerCase().endsWith(".csv")) {
            fileType = "CSV";
        } else {
            throw new IllegalArgumentException("Unsupported file type. Please upload an Excel (.xlsx) or CSV (.csv) file.");
        }

        SpreadsheetParserService.ParsedSheet parsed;
        try (InputStream is = file.getInputStream()) {
            if ("XLSX".equals(fileType)) {
                parsed = parserService.parseXlsx(is, targetSheet);
            } else {
                parsed = parserService.parseCsv(is);
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Spreadsheet parsing failed for file {}: {}", originalFilename, e.getMessage());
            throw new IllegalArgumentException("Failed to read spreadsheet contents: " + (e.getMessage() != null ? e.getMessage() : "Invalid or corrupted file format."));
        }

        if (parsed.headers().isEmpty()) {
            throw new IllegalArgumentException("The uploaded spreadsheet contains no recognizable columns or data headers.");
        }

        Map<String, String> suggestedMapping = parserService.suggestColumnMapping(parsed.headers());

        // Create ImportBatch in PREVIEW mode
        ImportBatch batch = new ImportBatch();
        batch.setCompany(company);
        batch.setUploadedBy(currentUser);
        batch.setOriginalFilename(originalFilename);
        batch.setFilename(UUID.randomUUID() + "_" + originalFilename.replaceAll("[^a-zA-Z0-9._-]", "_"));
        batch.setFileType(fileType);
        batch.setSheetName(parsed.selectedSheet());
        batch.setImportType("TRAVEL_HISTORY");
        batch.setStatus("PREVIEW");
        batch.setTotalRows(parsed.rows().size());
        batch.setColumnMapping(objectMapper.writeValueAsString(suggestedMapping));
        batch = batchRepository.save(batch);

        // Map and validate rows
        List<ImportedTravelRecord> records = new ArrayList<>();
        int rowNumber = 1;
        for (Map<String, String> rowMap : parsed.rows()) {
            ImportedTravelRecord record = mapRowToRecord(batch, currentUser, rowMap, suggestedMapping, rowNumber++);
            records.add(record);
        }

        // Validate and match records
        validateAndMatchRecords(currentUser, records);
        recordRepository.saveAll(records);

        // Update counts
        long validCount = records.stream().filter(r -> "VALID".equals(r.getStatus()) || "MATCHED".equals(r.getStatus()) || "UNMATCHED".equals(r.getStatus())).count();
        long errorCount = records.stream().filter(r -> "INVALID".equals(r.getStatus())).count();
        batch.setValidRows((int) validCount);
        batch.setErrorRows((int) errorCount);
        batch = batchRepository.save(batch);

        return ImportBatchResponse.from(batch, parsed.sheetNames(), parsed.headers(), suggestedMapping);
    }

    /**
     * Re-map existing batch with updated column mappings.
     */
    @Transactional
    public ImportBatchResponse updateMapping(Long batchId, Map<String, String> newMapping, User currentUser) throws Exception {
        ImportBatch batch = batchRepository.findByIdAndCompanyId(batchId, getRequiredCompanyId(currentUser))
                .orElseThrow(() -> new IllegalArgumentException("Import batch not found or access denied."));

        if (!"PREVIEW".equals(batch.getStatus())) {
            throw new IllegalStateException("Only preview batches can have their column mappings modified.");
        }

        List<ImportedTravelRecord> existingRecords = recordRepository.findByImportBatchId(batchId);
        List<String> headers = new ArrayList<>();

        for (ImportedTravelRecord record : existingRecords) {
            String rawJson = record.getRawRowData();
            if (rawJson != null && !rawJson.isBlank()) {
                Map<String, String> rowMap = objectMapper.readValue(rawJson, new TypeReference<>() {});
                if (headers.isEmpty()) {
                    headers.addAll(rowMap.keySet());
                }
                applyMappingToRecord(record, rowMap, newMapping);
            }
        }

        validateAndMatchRecords(currentUser, existingRecords);
        recordRepository.saveAll(existingRecords);

        long validCount = existingRecords.stream().filter(r -> "VALID".equals(r.getStatus()) || "MATCHED".equals(r.getStatus()) || "UNMATCHED".equals(r.getStatus())).count();
        long errorCount = existingRecords.stream().filter(r -> "INVALID".equals(r.getStatus())).count();
        batch.setColumnMapping(objectMapper.writeValueAsString(newMapping));
        batch.setValidRows((int) validCount);
        batch.setErrorRows((int) errorCount);
        batch = batchRepository.save(batch);

        Map<String, String> suggested = parserService.suggestColumnMapping(headers);
        List<String> sheetNames = batch.getSheetName() != null ? List.of(batch.getSheetName()) : List.of("Default");

        return ImportBatchResponse.from(batch, sheetNames, headers, suggested);
    }

    /**
     * Confirm and import preview records into the authoritative database.
     * Enforces Decision 1 (Option B: Project allocations child table),
     * Decision 2 (Option B: Safe unverified employee creation),
     * Decision 3 (Option A: Signed Net Cost),
     * and Decision 4 (Option A: Zero-fare transit preservation).
     */
    @Transactional
    public ImportResultResponse confirmImport(Long batchId, List<Long> selectedRecordIds, User currentUser) {
        Company company = getRequiredCompany(currentUser);
        ImportBatch batch = batchRepository.findByIdAndCompanyId(batchId, company.getId())
                .orElseThrow(() -> new IllegalArgumentException("Import batch not found or access denied."));

        if (!"PREVIEW".equals(batch.getStatus())) {
            throw new IllegalStateException("Batch is not in PREVIEW mode. Current status: " + batch.getStatus());
        }

        batch.setStatus("IMPORTING");
        batchRepository.save(batch);

        List<ImportedTravelRecord> recordsToProcess;
        if (selectedRecordIds != null && !selectedRecordIds.isEmpty()) {
            recordsToProcess = recordRepository.findAllById(selectedRecordIds).stream()
                    .filter(r -> r.getImportBatch().getId().equals(batchId))
                    .toList();
        } else {
            recordsToProcess = recordRepository.findByImportBatchId(batchId).stream()
                    .filter(r -> !"INVALID".equals(r.getStatus()) && !"DUPLICATE".equals(r.getStatus()))
                    .toList();
        }

        int importedCount = 0;
        int skippedCount = 0;
        int duplicateCount = 0;
        int errorCount = 0;
        List<ImportedTravelRecord> sampleImported = new ArrayList<>();

        for (ImportedTravelRecord record : recordsToProcess) {
            if ("INVALID".equals(record.getStatus()) || "DUPLICATE".equals(record.getStatus())) {
                errorCount++;
                continue;
            }

            // Concurrency-safe duplicate check against authoritative records
            if (record.getRawEmployeeIdentifier() != null && record.getTravelDate() != null
                    && record.getFromLocation() != null && record.getToLocation() != null) {
                List<ImportedTravelRecord> existing = recordRepository.findExistingDuplicates(
                        company.getId(),
                        record.getRawEmployeeIdentifier(),
                        record.getTravelDate(),
                        record.getFromLocation(),
                        record.getToLocation()
                );
                if (!existing.isEmpty()) {
                    record.setStatus("DUPLICATE");
                    record.setImported(false);
                    duplicateCount++;
                    skippedCount++;
                    continue;
                }
            }

            // Phase 5 / Decision 2 (Option B):
            // If employee is not linked, auto-create an Employee marked IMPORTED_UNVERIFIED
            if (record.getEmployee() == null && record.getRawEmployeeName() != null && !record.getRawEmployeeName().isBlank()) {
                String candidateName = record.getRawEmployeeName().trim();
                String normalized = normalizeDisplayName(candidateName);

                // Check alias repository first
                Optional<ImportedPassengerAlias> aliasOpt = (aliasRepository != null)
                        ? aliasRepository.findByCompanyIdAndRawNameString(company.getId(), candidateName)
                        : Optional.empty();

                Employee targetEmp;
                if (aliasOpt.isPresent() && aliasOpt.get().getEmployee() != null) {
                    targetEmp = aliasOpt.get().getEmployee();
                } else {
                    // Check if employee with same normalized name exists
                    List<Employee> existing = employeeRepository.findByCompanyIdAndNameIgnoreCase(company.getId(), normalized);
                    if (!existing.isEmpty()) {
                        targetEmp = existing.get(0);
                    } else {
                        // Create unverified employee profile (Safe: NO password, NO user account, NO login credentials)
                        String rawIdent = record.getRawEmployeeIdentifier();
                        String empCode = (rawIdent != null && !rawIdent.isBlank())
                                ? rawIdent.trim()
                                : "IMP-" + Math.abs(candidateName.toLowerCase().hashCode() % 100000);

                        // Ensure empCode uniqueness within company
                        if (employeeRepository.findByCompanyIdAndEmployeeId(company.getId(), empCode).isPresent()) {
                            empCode = empCode + "-" + record.getSourceRowNumber();
                        }

                        Employee newEmp = new Employee();
                        newEmp.setCompany(company);
                        newEmp.setName(normalized != null ? normalized : candidateName);
                        newEmp.setEmployeeId(empCode);
                        newEmp.setDepartment(record.getDepartment() != null ? record.getDepartment() : "General");
                        newEmp.setVerificationStatus("IMPORTED_UNVERIFIED");
                        newEmp.setSourceImportBatchId(batch.getId());
                        newEmp.setActive(true);
                        targetEmp = employeeRepository.save(newEmp);
                    }

                    // Save alias
                    if (aliasRepository != null) {
                        try {
                            ImportedPassengerAlias alias = new ImportedPassengerAlias(
                                    company,
                                    candidateName,
                                    targetEmp.getName(),
                                    targetEmp,
                                    "AUTO_STAGED",
                                    "HIGH"
                            );
                            aliasRepository.save(alias);
                        } catch (Exception ignored) {}
                    }
                }

                record.setEmployee(targetEmp);
                record.setMatchConfidence("HIGH");
            }

            // Phase 4 / Decision 1 (Option B): Save Project Allocations
            if (allocationRepository != null && record.getAllocations() != null && !record.getAllocations().isEmpty()) {
                for (TravelRecordProjectAllocation alloc : record.getAllocations()) {
                    alloc.setImportedTravelRecord(record);
                    allocationRepository.save(alloc);
                }
            }

            record.setImported(true);
            record.setStatus("IMPORTED");
            importedCount++;
            if (sampleImported.size() < 10) {
                sampleImported.add(record);
            }
        }

        recordRepository.saveAll(recordsToProcess);

        // Phase 6 / Decision 4 (Option A): Journey Reconstruction
        if (journeyAggregationService != null) {
            try {
                journeyAggregationService.reconstructJourneysForBatch(batch, recordsToProcess);
                recordRepository.saveAll(recordsToProcess);
            } catch (Exception e) {
                log.warn("Journey reconstruction for batch {} completed with notice: {}", batch.getId(), e.getMessage());
            }
        }

        batch.setStatus("COMPLETED");
        batch.setImportedRows(importedCount);
        batch.setSkippedRows(skippedCount);
        batch.setErrorRows(errorCount);
        batch.setCompletedAt(LocalDateTime.now());
        batchRepository.save(batch);

        return new ImportResultResponse(
                batch.getId(),
                recordsToProcess.size(),
                importedCount,
                skippedCount,
                duplicateCount,
                errorCount,
                "COMPLETED",
                sampleImported.stream().map(ImportedRecordResponse::from).toList()
        );
    }

    public ImportBatchResponse getBatch(Long batchId, User currentUser) {
        ImportBatch batch = batchRepository.findByIdAndCompanyId(batchId, getRequiredCompanyId(currentUser))
                .orElseThrow(() -> new IllegalArgumentException("Import batch not found or access denied."));

        List<ImportedTravelRecord> records = recordRepository.findByImportBatchId(batchId);
        List<String> headers = Collections.emptyList();
        if (!records.isEmpty() && records.get(0).getRawRowData() != null) {
            try {
                Map<String, String> rowMap = objectMapper.readValue(records.get(0).getRawRowData(), new TypeReference<>() {});
                headers = new ArrayList<>(rowMap.keySet());
            } catch (Exception ignored) {}
        }
        Map<String, String> suggested = parserService.suggestColumnMapping(headers);
        List<String> sheetNames = batch.getSheetName() != null ? List.of(batch.getSheetName()) : List.of("Default");

        return ImportBatchResponse.from(batch, sheetNames, headers, suggested);
    }

    public Page<ImportBatchResponse> listBatches(User currentUser, Pageable pageable) {
        Page<ImportBatch> page = batchRepository.findByCompanyIdOrderByCreatedAtDesc(getRequiredCompanyId(currentUser), pageable);
        return page.map(b -> ImportBatchResponse.from(b, null, null, null));
    }

    public Page<ImportedRecordResponse> getPreviewRecords(Long batchId, String search, String status, User currentUser, Pageable pageable) {
        batchRepository.findByIdAndCompanyId(batchId, getRequiredCompanyId(currentUser))
                .orElseThrow(() -> new IllegalArgumentException("Import batch not found or access denied."));

        Page<ImportedTravelRecord> page;
        if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
            page = recordRepository.findByImportBatchIdAndStatus(batchId, status.toUpperCase(), pageable);
        } else {
            page = recordRepository.findByImportBatchId(batchId, pageable);
        }

        if (search != null && !search.isBlank()) {
            String q = search.toLowerCase();
            List<ImportedTravelRecord> filtered = page.getContent().stream()
                    .filter(r -> (r.getRawEmployeeName() != null && r.getRawEmployeeName().toLowerCase().contains(q)) ||
                                 (r.getEmployee() != null && r.getEmployee().getName() != null && r.getEmployee().getName().toLowerCase().contains(q)) ||
                                 (r.getRawEmployeeIdentifier() != null && r.getRawEmployeeIdentifier().toLowerCase().contains(q)) ||
                                 (r.getFromLocation() != null && r.getFromLocation().toLowerCase().contains(q)) ||
                                 (r.getToLocation() != null && r.getToLocation().toLowerCase().contains(q)) ||
                                 (r.getTicketReference() != null && r.getTicketReference().toLowerCase().contains(q)) ||
                                 (r.getDepartment() != null && r.getDepartment().toLowerCase().contains(q)))
                    .toList();
            return new PageImpl<>(filtered.stream().map(ImportedRecordResponse::from).toList(), pageable, filtered.size());
        }

        return page.map(ImportedRecordResponse::from);
    }

    public Page<ImportedRecordResponse> searchTravelHistory(
            User currentUser,
            Long employeeId,
            LocalDate fromDate,
            LocalDate toDate,
            String search,
            Pageable pageable
    ) {
        Long companyId = getRequiredCompanyId(currentUser);
        Page<ImportedTravelRecord> page = recordRepository.searchTravelHistoryFiltered(
                companyId, employeeId, fromDate, toDate, search, pageable
        );
        return page.map(ImportedRecordResponse::from);
    }

    public String exportTravelHistoryCsv(
            User currentUser,
            Long employeeId,
            LocalDate fromDate,
            LocalDate toDate,
            String search
    ) {
        Long companyId = getRequiredCompanyId(currentUser);
        List<ImportedTravelRecord> records = recordRepository.findForExport(companyId, employeeId, fromDate, toDate, search);

        StringBuilder sb = new StringBuilder();
        sb.append("Employee ID,Employee Name,Travel Date,Return Date,From,To,Ticket Reference,Department,Travel Mode,Category,Provider,Gross Cost (INR),Net Cost (INR),Credit Note,Project,Status\r\n");

        for (ImportedTravelRecord r : records) {
            sb.append(escapeCsv(r.getRawEmployeeIdentifier())).append(",");
            sb.append(escapeCsv(r.getRawEmployeeName())).append(",");
            sb.append(escapeCsv(r.getTravelDate() != null ? r.getTravelDate().toString() : "")).append(",");
            sb.append(escapeCsv(r.getReturnDate() != null ? r.getReturnDate().toString() : "")).append(",");
            sb.append(escapeCsv(r.getFromLocation())).append(",");
            sb.append(escapeCsv(r.getToLocation())).append(",");
            sb.append(escapeCsv(r.getTicketReference())).append(",");
            sb.append(escapeCsv(r.getDepartment())).append(",");
            sb.append(escapeCsv(r.getTravelMode())).append(",");
            sb.append(escapeCsv(r.getTravelCategory())).append(",");
            sb.append(escapeCsv(r.getProvider())).append(",");
            sb.append(escapeCsv(r.getCost() != null ? r.getCost().toPlainString() : "")).append(",");
            sb.append(escapeCsv(r.getNetCost() != null ? r.getNetCost().toPlainString() : "")).append(",");
            sb.append(r.isCreditNote() ? "YES" : "NO").append(",");
            sb.append(escapeCsv(r.getProject() != null ? r.getProject().getProjectName() : r.getProjectName())).append(",");
            sb.append(escapeCsv(r.getStatus())).append("\r\n");
        }

        return sb.toString();
    }

    private ImportedTravelRecord mapRowToRecord(
            ImportBatch batch,
            User currentUser,
            Map<String, String> rowMap,
            Map<String, String> mapping,
            int rowNumber
    ) {
        ImportedTravelRecord record = new ImportedTravelRecord();
        record.setCompany(getRequiredCompany(currentUser));
        record.setImportBatch(batch);
        record.setSourceRowNumber(rowNumber);
        record.setSourceWorksheet(batch.getSheetName());
        try {
            record.setRawRowData(objectMapper.writeValueAsString(rowMap));
        } catch (Exception e) {
            record.setRawRowData("{}");
        }

        applyMappingToRecord(record, rowMap, mapping);
        return record;
    }

    private void applyMappingToRecord(ImportedTravelRecord record, Map<String, String> rowMap, Map<String, String> mapping) {
        Company company = record.getCompany();

        // 1. Employee Identifier
        String empId = getMappedValue(rowMap, mapping, "employeeId");
        if (empId == null || empId.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                if ((normKey.equals("id") || normKey.equals("emp id") || normKey.equals("empid") ||
                     normKey.equals("employee id") || normKey.equals("employee code") ||
                     normKey.equals("emp no") || normKey.equals("staff id") || normKey.equals("ps no") ||
                     normKey.equals("badge id")) && entry.getValue() != null && !entry.getValue().isBlank()) {
                    empId = entry.getValue().trim();
                    break;
                }
            }
        }
        record.setRawEmployeeIdentifier(empId);

        // 2. Passenger / Employee Name
        String rawName = getMappedValue(rowMap, mapping, "employeeName");
        if (rawName == null || rawName.isBlank()) {
            String firstName = getMappedValue(rowMap, mapping, "firstName");
            String lastName = getMappedValue(rowMap, mapping, "lastName");
            if (firstName != null || lastName != null) {
                rawName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
            }
        }
        if (rawName == null || rawName.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                boolean isNameCol = (normKey.contains("passenger") || normKey.contains("pax") ||
                                     normKey.contains("traveler") || normKey.contains("traveller") ||
                                     normKey.contains("guest") ||
                                     (normKey.contains("name") && !normKey.contains("project") &&
                                      !normKey.contains("dept") && !normKey.contains("department") &&
                                      !normKey.contains("company") && !normKey.contains("file") &&
                                      !normKey.contains("sheet") && !normKey.contains("vendor") &&
                                      !normKey.contains("airline") && !normKey.contains("carrier")));
                if (isNameCol && entry.getValue() != null && !entry.getValue().isBlank()) {
                    rawName = entry.getValue().trim();
                    break;
                }
            }
        }
        String normalizedName = normalizeDisplayName(rawName);
        record.setRawEmployeeName(normalizedName != null && !normalizedName.isBlank() ? normalizedName : rawName);

        // 3. Sector / Route
        String fromLoc = getMappedValue(rowMap, mapping, "fromLocation");
        String toLoc = getMappedValue(rowMap, mapping, "toLocation");

        if (fromLoc == null || toLoc == null) {
            String sector = getMappedValue(rowMap, mapping, "sector");
            if (sector == null || sector.isBlank()) {
                sector = getMappedValue(rowMap, mapping, "route");
            }
            if (sector == null || sector.isBlank()) {
                for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                    String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                    if ((normKey.equals("sector") || normKey.equals("sectors") ||
                         normKey.equals("routing") || normKey.equals("route") ||
                         normKey.equals("city pair")) && entry.getValue() != null && !entry.getValue().isBlank()) {
                        sector = entry.getValue().trim();
                        break;
                    }
                }
            }

            if (sector != null && !sector.isBlank()) {
                String[] parts = sector.split("\\s*(?:-|–|—|/|\\bto\\b)\\s*");
                if (parts.length >= 2) {
                    if (fromLoc == null || fromLoc.isBlank()) fromLoc = parts[0].trim();
                    if (toLoc == null || toLoc.isBlank()) toLoc = parts[parts.length - 1].trim();
                } else if (parts.length == 1 && (fromLoc == null || fromLoc.isBlank())) {
                    fromLoc = parts[0].trim();
                    toLoc = fromLoc;
                }
            }
        }
        if (fromLoc != null && !fromLoc.isBlank() && (toLoc == null || toLoc.isBlank())) {
            toLoc = fromLoc;
        }
        if (toLoc != null && !toLoc.isBlank() && (fromLoc == null || fromLoc.isBlank())) {
            fromLoc = toLoc;
        }
        record.setFromLocation(fromLoc);
        record.setToLocation(toLoc);

        // 4. Ticket Reference / PNR
        String ticket = getMappedValue(rowMap, mapping, "ticketReference");
        if (ticket == null || ticket.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                if ((normKey.contains("ticket") || normKey.contains("tkt") || normKey.contains("pnr") || normKey.equals("reference") || normKey.equals("voucher no") || normKey.equals("voucherno")) &&
                    entry.getValue() != null && !entry.getValue().isBlank()) {
                    ticket = entry.getValue().trim();
                    break;
                }
            }
        }
        record.setTicketReference(ticket);

        record.setDepartment(getMappedValue(rowMap, mapping, "department"));

        // 5. Provider
        String provider = getMappedValue(rowMap, mapping, "provider");
        if (provider == null || provider.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                if ((normKey.contains("airline") || normKey.contains("carrier") || normKey.contains("airways") || normKey.contains("vendor")) &&
                    entry.getValue() != null && !entry.getValue().isBlank()) {
                    provider = entry.getValue().trim();
                    break;
                }
            }
        }
        record.setProvider(provider);

        // 6. Travel Mode & Category
        String travelMode = getMappedValue(rowMap, mapping, "travelMode");
        String serviceVal = "";
        for (Map.Entry<String, String> entry : rowMap.entrySet()) {
            if (entry.getKey().trim().equalsIgnoreCase("SERVICE")) {
                serviceVal = entry.getValue() != null ? entry.getValue().trim().toUpperCase() : "";
                break;
            }
        }

        String sectorUpper = fromLoc != null ? fromLoc.toUpperCase() : "";
        String travelCategory = "DOMESTIC_FLIGHT";
        if ("HOTEL".equalsIgnoreCase(serviceVal) || "HOTEL".equalsIgnoreCase(travelMode) ||
            sectorUpper.contains("HOTEL") || sectorUpper.contains("LE MERIDIEN") ||
            sectorUpper.contains("HOLIDAY INN") || sectorUpper.contains("RESORT") ||
            sectorUpper.contains("PALACE") || sectorUpper.contains("PLAZA") ||
            sectorUpper.contains("COMFORT") || sectorUpper.contains("HEAVEN")) {
            travelMode = "HOTEL";
            travelCategory = "HOTEL";
        } else if ("BUS".equalsIgnoreCase(serviceVal) || "BUS".equalsIgnoreCase(travelMode)) {
            travelMode = "BUS";
            travelCategory = "BUS";
        } else if ("VISA".equalsIgnoreCase(serviceVal) || "VISA".equalsIgnoreCase(travelMode) ||
                   sectorUpper.contains("VISA")) {
            travelMode = "VISA";
            travelCategory = "VISA";
        } else {
            travelMode = "FLIGHT";
            if (isInternational(fromLoc, toLoc)) {
                travelCategory = "INTERNATIONAL_FLIGHT";
            } else {
                travelCategory = "DOMESTIC_FLIGHT";
            }
        }
        record.setTravelMode(travelMode);
        record.setTravelCategory(travelCategory);

        // 7. Travel Date
        String travelDateStr = getMappedValue(rowMap, mapping, "travelDate");
        if (travelDateStr == null || travelDateStr.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                if ((normKey.contains("date") || normKey.contains("dt")) &&
                    !normKey.contains("return") && !normKey.contains("arr") &&
                    entry.getValue() != null && !entry.getValue().isBlank()) {
                    travelDateStr = entry.getValue().trim();
                    break;
                }
            }
        }
        // Fallback: check all cell values for a parseable calendar date
        if (travelDateStr == null || travelDateStr.isBlank()) {
            for (String val : rowMap.values()) {
                if (val != null && !val.isBlank()) {
                    LocalDate parsed = parseDateSafely(val);
                    if (parsed != null && parsed.getYear() >= 2020 && parsed.getYear() <= 2030) {
                        travelDateStr = val;
                        break;
                    }
                }
            }
        }
        record.setTravelDate(parseDateSafely(travelDateStr));

        String returnDateStr = getMappedValue(rowMap, mapping, "returnDate");
        record.setReturnDate(parseDateSafely(returnDateStr));

        // 8. Cost & Credit Note Detection
        String costStr = getMappedValue(rowMap, mapping, "cost");
        String basicFareStr = null;
        String taxStr = null;
        String totalBillStr = null;
        for (Map.Entry<String, String> entry : rowMap.entrySet()) {
            String norm = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", "").trim();
            if (norm.equals("basic") || norm.equals("basicfare")) {
                basicFareStr = entry.getValue();
            } else if (norm.equals("tax") || norm.equals("taxes")) {
                taxStr = entry.getValue();
            } else if (norm.contains("totalbill") || norm.contains("totalamount")) {
                totalBillStr = entry.getValue();
            }
        }

        if (costStr == null || costStr.isBlank()) {
            for (Map.Entry<String, String> entry : rowMap.entrySet()) {
                String normKey = entry.getKey().toLowerCase().replaceAll("[^a-z0-9]", " ").trim();
                if ((normKey.contains("total bill") || normKey.contains("total amount") ||
                     normKey.contains("amount") || normKey.contains("fare") || normKey.contains("cost") ||
                     normKey.contains("total") || normKey.contains("net") || normKey.contains("basic")) &&
                    entry.getValue() != null && !entry.getValue().isBlank()) {
                    costStr = entry.getValue().trim();
                    break;
                }
            }
        }

        BigDecimal cost = parseCostSafely(costStr);
        BigDecimal basicFare = parseCostSafely(basicFareStr);
        BigDecimal tax = parseCostSafely(taxStr);
        BigDecimal totalBill = parseCostSafely(totalBillStr);

        boolean isCreditNote = false;
        if (basicFare != null && basicFare.compareTo(BigDecimal.ZERO) < 0) {
            isCreditNote = true;
        }
        if (cost != null && cost.compareTo(BigDecimal.ZERO) < 0) {
            isCreditNote = true;
        }
        if (tax != null && tax.compareTo(BigDecimal.ZERO) < 0 && (basicFare == null || basicFare.compareTo(BigDecimal.ZERO) <= 0)) {
            isCreditNote = true;
        }
        if (ticket != null && (ticket.toUpperCase().startsWith("CN") || ticket.toUpperCase().contains("CR"))) {
            isCreditNote = true;
        }

        if (isCreditNote && (cost == null || cost.compareTo(BigDecimal.ZERO) == 0)) {
            if (totalBill != null && totalBill.compareTo(BigDecimal.ZERO) > 0) {
                cost = totalBill.abs();
            } else if (tax != null && tax.compareTo(BigDecimal.ZERO) < 0) {
                cost = tax.abs();
            }
        }

        record.setCost(cost != null ? cost.abs() : BigDecimal.ZERO);
        record.setCreditNote(isCreditNote);
        if (isCreditNote) {
            record.setNetCost(cost != null ? cost.abs().negate() : BigDecimal.ZERO);
        } else {
            record.setNetCost(cost != null ? cost.abs() : BigDecimal.ZERO);
        }

        // 9. Zero-fare transit leg detection (Decision 4 - Option A)
        // Genuine connecting transit flight legs have 0 cost and are NOT credit notes
        if (!isCreditNote && cost != null && cost.compareTo(BigDecimal.ZERO) == 0 &&
            (record.getFromLocation() != null || record.getToLocation() != null)) {
            record.setZeroFareTransit(true);
            record.setNetCost(BigDecimal.ZERO);
        }

        // 10. Phase 4: Project Matrix Unpivoting (Decision 1 - Option B)
        unpivotProjectAllocations(record, rowMap, mapping, company);
    }

    /**
     * Unpivots horizontal project columns (e.g. 19 columns in Mahathi ledger)
     * into relational child records (travel_record_project_allocations).
     */
    private void unpivotProjectAllocations(ImportedTravelRecord record, Map<String, String> rowMap, Map<String, String> mapping, Company company) {
        if (projectRepository == null) return;

        List<TravelRecordProjectAllocation> allocations = new ArrayList<>();
        Project primaryProject = null;

        // Non-project standard headers to skip
        Set<String> standardHeaders = Set.of(
                "S.NO", "SL", "SERVICE", "DATE", "REFERENCE", "PASSENGER", "PAX",
                "BASIC", "TAX", "DIS RATE%", "COMMSION", "COMMISSION", "TDS",
                "OTHER CHARGES", "TOTAL BILL VALUE", "TOTAL", "AMOUNT", "SECTOR",
                "TICKET", "TICKET NO", "AIRLINE", "CARRIER"
        );

        Set<String> skipHeaders = new HashSet<>(standardHeaders);
        if (mapping != null) {
            for (String mappedCol : mapping.values()) {
                if (mappedCol != null && !mappedCol.isBlank()) {
                    skipHeaders.add(mappedCol.toUpperCase().replaceAll("[^A-Z0-9 ]", " ").trim());
                }
            }
        }

        for (Map.Entry<String, String> entry : rowMap.entrySet()) {
            String colHeader = entry.getKey().trim();
            String upper = colHeader.toUpperCase().replaceAll("[^A-Z0-9 ]", " ").trim();

            if (skipHeaders.contains(upper)) continue;

            String valStr = entry.getValue();
            if (valStr == null || valStr.isBlank()) continue;

            BigDecimal allocAmt = parseCostSafely(valStr);
            if (allocAmt == null || allocAmt.compareTo(BigDecimal.ZERO) == 0) continue;

            // Normalize project code and name
            String pCode = upper.replaceAll("\\s+", "_");
            String pName = colHeader;
            if (pName.contains("-")) {
                String[] pParts = pName.split("-", 2);
                pName = pParts[pParts.length - 1].trim();
            }

            final String finalPName = pName;
            final String finalPCode = pCode;

            // Find or create Project entity
            Project project = projectRepository.findByNameOrCode(company.getId(), finalPName, finalPCode)
                    .orElseGet(() -> {
                        Project newP = new Project(company, finalPCode, finalPName, null, null, null, "ACTIVE");
                        return projectRepository.save(newP);
                    });

            if (primaryProject == null) {
                primaryProject = project;
            }

            TravelRecordProjectAllocation alloc = new TravelRecordProjectAllocation(
                    company,
                    record,
                    project,
                    allocAmt.abs(),
                    "SPREADSHEET_MATRIX"
            );
            allocations.add(alloc);
        }

        record.setAllocations(allocations);
        if (primaryProject != null) {
            record.setProject(primaryProject);
            record.setProjectName(primaryProject.getProjectName());
        }
    }

    private boolean isInternational(String fromLoc, String toLoc) {
        if (toLoc != null) {
            String u = toLoc.toUpperCase();
            for (String ind : INTERNATIONAL_INDICATORS) {
                if (u.contains(ind)) return true;
            }
        }
        if (fromLoc != null) {
            String u = fromLoc.toUpperCase();
            for (String ind : INTERNATIONAL_INDICATORS) {
                if (u.contains(ind)) return true;
            }
        }
        return false;
    }

    private void validateAndMatchRecords(User currentUser, List<ImportedTravelRecord> records) {
        Long companyId = getRequiredCompanyId(currentUser);
        Set<String> seenBatchKeys = new HashSet<>();
        List<Employee> allCompanyEmployees = employeeRepository.findByCompanyId(companyId);

        for (ImportedTravelRecord record : records) {
            List<String> errors = new ArrayList<>();

            // 1. Validation checks
            if (record.getTravelDate() == null && (record.getFromLocation() == null || record.getToLocation() == null)) {
                errors.add("Missing travel date and route details.");
            }
            if (record.getRawEmployeeIdentifier() == null && record.getRawEmployeeName() == null) {
                errors.add("Missing employee identifier and passenger name.");
            }

            // 2. Employee matching (Exact ID -> Alias Map -> Exact Name -> Fuzzy)
            Employee matched = null;
            String confidence = "NONE";

            if (record.getRawEmployeeIdentifier() != null && !record.getRawEmployeeIdentifier().isBlank()) {
                Optional<Employee> empOpt = employeeRepository.findByCompanyIdAndEmployeeId(companyId, record.getRawEmployeeIdentifier().trim());
                if (empOpt.isPresent()) {
                    matched = empOpt.get();
                    confidence = "HIGH";
                }
            }

            String candidateName = record.getRawEmployeeName() != null ? record.getRawEmployeeName().trim() : null;
            if (matched == null && candidateName != null && aliasRepository != null) {
                Optional<ImportedPassengerAlias> aliasOpt = aliasRepository.findByCompanyIdAndRawNameString(companyId, candidateName);
                if (aliasOpt.isPresent() && aliasOpt.get().getEmployee() != null) {
                    matched = aliasOpt.get().getEmployee();
                    confidence = "HIGH";
                }
            }

            if (matched == null && candidateName != null && !candidateName.isBlank()) {
                List<Employee> byName = employeeRepository.findByCompanyIdAndNameIgnoreCase(companyId, candidateName);
                if (byName.size() == 1) {
                    matched = byName.get(0);
                    confidence = "MEDIUM";
                } else if (byName.size() > 1) {
                    confidence = "AMBIGUOUS";
                    errors.add("Multiple employees match name '" + candidateName + "'. Identifier required.");
                } else {
                    List<Employee> tokenMatches = new ArrayList<>();
                    for (Employee emp : allCompanyEmployees) {
                        if (emp.getName() != null && matchesNameTokens(candidateName, emp.getName())) {
                            tokenMatches.add(emp);
                        }
                    }
                    if (tokenMatches.size() == 1) {
                        matched = tokenMatches.get(0);
                        confidence = "MEDIUM";
                    }
                }
            }

            record.setEmployee(matched);
            record.setMatchConfidence(confidence);

            // Phase 3: Hardened Deduplication composite key
            String ticketRef = record.getTicketReference() != null && !record.getTicketReference().isBlank()
                    ? record.getTicketReference().trim().toUpperCase()
                    : "ROW_" + record.getSourceRowNumber();

            // If ticketRef is a generic invoice or voucher reference, append source row number for within-batch uniqueness
            if (ticketRef.startsWith("PH6G") || ticketRef.startsWith("VOUCHER") || ticketRef.startsWith("INV") || ticketRef.startsWith("BATCH")) {
                ticketRef = ticketRef + "_" + record.getSourceRowNumber();
            }

            String costPart = record.getCost() != null ? record.getCost().toPlainString() : "0";
            String batchKey = String.format("%s|%s|%s|%s|%s|%s|%s",
                    record.getRawEmployeeIdentifier() != null ? record.getRawEmployeeIdentifier() : record.getRawEmployeeName(),
                    record.getTravelDate(),
                    record.getFromLocation(),
                    record.getToLocation(),
                    ticketRef,
                    costPart,
                    record.isCreditNote() ? "CN" : "TX");

            boolean isBatchDuplicate = !seenBatchKeys.add(batchKey);

            if (!errors.isEmpty()) {
                record.setStatus("INVALID");
            } else if (isBatchDuplicate) {
                record.setStatus("DUPLICATE");
                errors.add("Duplicate record found within this spreadsheet.");
            } else if (matched != null) {
                record.setStatus("MATCHED");
            } else if ("AMBIGUOUS".equals(confidence)) {
                record.setStatus("INVALID");
            } else {
                record.setStatus("VALID");
            }

            try {
                record.setValidationErrors(objectMapper.writeValueAsString(errors));
            } catch (Exception ignored) {}
        }
    }

    private boolean matchesNameTokens(String a, String b) {
        if (a == null || b == null) return false;
        Set<String> titles = Set.of("mr", "mrs", "ms", "miss", "dr", "prof");
        Set<String> tokensA = new HashSet<>();
        for (String t : a.toLowerCase().split("[^a-z0-9]+")) {
            if (!t.isBlank() && !titles.contains(t)) tokensA.add(t);
        }
        Set<String> tokensB = new HashSet<>();
        for (String t : b.toLowerCase().split("[^a-z0-9]+")) {
            if (!t.isBlank() && !titles.contains(t)) tokensB.add(t);
        }
        return !tokensA.isEmpty() && tokensA.equals(tokensB);
    }

    private String getMappedValue(Map<String, String> rowMap, Map<String, String> mapping, String field) {
        String colHeader = mapping.get(field);
        if (colHeader != null && rowMap.containsKey(colHeader)) {
            String val = rowMap.get(colHeader);
            return (val != null && !val.isBlank()) ? val.trim() : null;
        }
        return null;
    }

    public static String normalizeDisplayName(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();

        Set<String> titles = Set.of("MR", "MRS", "MS", "MISS", "MSTR", "MASTER", "DR", "PROF");

        if (s.contains("/")) {
            String[] parts = s.split("/", 2);
            String last = parts[0].trim();
            String first = parts.length > 1 ? parts[1].trim() : "";

            String[] firstWords = first.split("\\s+");
            List<String> cleanedFirst = new ArrayList<>();
            for (int i = 0; i < firstWords.length; i++) {
                String w = firstWords[i];
                String stripped = w.replace(".", "").toUpperCase();
                if (i == firstWords.length - 1 && titles.contains(stripped)) {
                    continue;
                }
                cleanedFirst.add(w);
            }
            first = String.join(" ", cleanedFirst).trim();
            s = (first + " " + last).trim();
        } else if (s.contains(",")) {
            String[] parts = s.split(",", 2);
            String last = parts[0].trim();
            String first = parts.length > 1 ? parts[1].trim() : "";

            String[] firstWords = first.split("\\s+");
            List<String> cleanedFirst = new ArrayList<>();
            for (int i = 0; i < firstWords.length; i++) {
                String w = firstWords[i];
                String stripped = w.replace(".", "").toUpperCase();
                if (i == firstWords.length - 1 && titles.contains(stripped)) {
                    continue;
                }
                cleanedFirst.add(w);
            }
            first = String.join(" ", cleanedFirst).trim();
            s = (first + " " + last).trim();
        } else {
            String[] words = s.split("\\s+");
            List<String> list = new ArrayList<>(Arrays.asList(words));
            if (!list.isEmpty() && titles.contains(list.get(0).replace(".", "").toUpperCase())) {
                list.remove(0);
            }
            if (!list.isEmpty() && titles.contains(list.get(list.size() - 1).replace(".", "").toUpperCase())) {
                list.remove(list.size() - 1);
            }
            s = String.join(" ", list).trim();
        }

        if (s.isBlank()) return raw.trim();

        String[] words = s.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < words.length; i++) {
            String w = words[i];
            if (w.isEmpty()) continue;
            if (w.length() == 1) {
                sb.append(Character.toUpperCase(w.charAt(0)));
            } else {
                sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1).toLowerCase());
            }
            if (i < words.length - 1) sb.append(" ");
        }
        return sb.toString();
    }

    private LocalDate parseDateSafely(String str) {
        if (str == null || str.isBlank()) return null;
        String trimmed = str.trim();

        List<DateTimeFormatter> formatters = List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd"),
                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("d/M/yyyy"),
                DateTimeFormatter.ofPattern("MM/dd/yyyy"),
                DateTimeFormatter.ofPattern("M/d/yyyy"),
                DateTimeFormatter.ofPattern("dd/MM/yy"),
                DateTimeFormatter.ofPattern("d/M/yy"),
                DateTimeFormatter.ofPattern("MM/dd/yy"),
                DateTimeFormatter.ofPattern("M/d/yy"),
                DateTimeFormatter.ofPattern("d-M-yyyy"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy"),
                DateTimeFormatter.ofPattern("d-M-yy"),
                DateTimeFormatter.ofPattern("dd-MM-yy"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy"),
                DateTimeFormatter.ofPattern("d.M.yyyy"),
                DateTimeFormatter.ofPattern("dd.MM.yy"),
                DateTimeFormatter.ofPattern("d.M.yy"),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("dd-MMM-yyyy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("d-MMM-yyyy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("dd-MMM-yy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("d-MMM-yy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("dd MMM yyyy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("d MMM yyyy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("dd MMM yy").toFormatter(Locale.ENGLISH),
                new java.time.format.DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("d MMM yy").toFormatter(Locale.ENGLISH)
        );

        for (DateTimeFormatter dtf : formatters) {
            try {
                return LocalDate.parse(trimmed, dtf);
            } catch (DateTimeParseException ignored) {}
        }

        return null;
    }

    public static BigDecimal parseCostSafely(String str) {
        if (str == null || str.isBlank()) return null;
        try {
            String trimmed = str.trim();
            String upper = trimmed.toUpperCase();
            boolean isCrNegative = upper.endsWith("CR");
            String checkLetters = isCrNegative ? upper.substring(0, upper.length() - 2) : upper;
            if (checkLetters.matches(".*[A-Za-z].*")) {
                return null;
            }
            boolean isParenNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
            String cleaned = trimmed.replaceAll("[^0-9.-]", "");
            if (cleaned.isBlank() || cleaned.equals("-") || cleaned.equals(".")) return null;
            BigDecimal val = new BigDecimal(cleaned);
            if ((isParenNegative || isCrNegative) && val.compareTo(BigDecimal.ZERO) > 0) {
                val = val.negate();
            }
            return val;
        } catch (Exception e) {
            return null;
        }
    }

    private String escapeCsv(String value) {
        if (value == null) return "\"\"";
        String val = value;
        if (!val.isEmpty()) {
            char first = val.charAt(0);
            if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r') {
                val = "'" + val;
            }
        }
        val = val.replace("\"", "\"\"");
        return "\"" + val + "\"";
    }
}
