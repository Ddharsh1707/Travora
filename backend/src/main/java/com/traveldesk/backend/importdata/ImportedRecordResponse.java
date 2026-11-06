package com.traveldesk.backend.importdata;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.project.TravelRecordProjectAllocation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

public record ImportedRecordResponse(
        Long id,
        Long importBatchId,
        String rawEmployeeIdentifier,
        String rawEmployeeName,
        Long matchedEmployeeId,
        String matchedEmployeeName,
        String matchedEmployeeCode,
        LocalDate travelDate,
        LocalDate returnDate,
        String fromLocation,
        String toLocation,
        String ticketReference,
        String department,
        String travelMode,
        String provider,
        BigDecimal cost,
        String projectName,
        String status,
        String matchConfidence,
        List<String> validationErrors,
        int sourceRowNumber,
        boolean imported,
        String rawRowData,
        Boolean isCreditNote,
        BigDecimal netCost,
        Boolean isZeroFareTransit,
        String travelCategory,
        String originalTicketReference,
        List<AllocationItem> allocations
) {
    public record AllocationItem(
            Long id,
            Long projectId,
            String projectCode,
            String projectName,
            BigDecimal allocatedAmount
    ) {}

    private static final ObjectMapper mapper = new ObjectMapper();

    public ImportedRecordResponse(
            Long id,
            Long importBatchId,
            String rawEmployeeIdentifier,
            String rawEmployeeName,
            Long matchedEmployeeId,
            String matchedEmployeeName,
            String matchedEmployeeCode,
            LocalDate travelDate,
            LocalDate returnDate,
            String fromLocation,
            String toLocation,
            String ticketReference,
            String department,
            String travelMode,
            String provider,
            BigDecimal cost,
            String projectName,
            String status,
            String matchConfidence,
            List<String> validationErrors,
            int sourceRowNumber,
            boolean imported,
            String rawRowData
    ) {
        this(id, importBatchId, rawEmployeeIdentifier, rawEmployeeName, matchedEmployeeId, matchedEmployeeName, matchedEmployeeCode,
             travelDate, returnDate, fromLocation, toLocation, ticketReference, department, travelMode, provider, cost,
             projectName, status, matchConfidence, validationErrors, sourceRowNumber, imported, rawRowData,
             false, cost, false, "DOMESTIC_FLIGHT", null, Collections.emptyList());
    }

    public static ImportedRecordResponse from(ImportedTravelRecord record) {
        List<String> errors = Collections.emptyList();
        if (record.getValidationErrors() != null && !record.getValidationErrors().isBlank()) {
            try {
                errors = mapper.readValue(record.getValidationErrors(), new TypeReference<>() {});
            } catch (Exception ignored) {}
        }

        Long matchedId = null;
        String matchedName = null;
        String matchedCode = null;
        if (record.getEmployee() != null) {
            matchedId = record.getEmployee().getId();
            matchedName = record.getEmployee().getName();
            matchedCode = record.getEmployee().getEmployeeId();
        }

        List<AllocationItem> allocItems = Collections.emptyList();
        if (record.getAllocations() != null && !record.getAllocations().isEmpty()) {
            allocItems = record.getAllocations().stream()
                    .map(a -> new AllocationItem(
                            a.getId(),
                            a.getProject() != null ? a.getProject().getId() : null,
                            a.getProject() != null ? a.getProject().getProjectCode() : "PRJ",
                            a.getProject() != null ? a.getProject().getProjectName() : "Project",
                            a.getAllocatedAmount()
                    ))
                    .toList();
        }

        return new ImportedRecordResponse(
                record.getId(),
                record.getImportBatch() != null ? record.getImportBatch().getId() : null,
                record.getRawEmployeeIdentifier(),
                record.getRawEmployeeName(),
                matchedId,
                matchedName,
                matchedCode,
                record.getTravelDate(),
                record.getReturnDate(),
                record.getFromLocation(),
                record.getToLocation(),
                record.getTicketReference(),
                record.getDepartment(),
                record.getTravelMode(),
                record.getProvider(),
                record.getCost(),
                record.getProject() != null ? record.getProject().getProjectName() : record.getProjectName(),
                record.getStatus(),
                record.getMatchConfidence(),
                errors,
                record.getSourceRowNumber(),
                record.isImported(),
                record.getRawRowData(),
                record.isCreditNote(),
                record.getNetCost(),
                record.isZeroFareTransit(),
                record.getTravelCategory(),
                record.getOriginalTicketReference(),
                allocItems
        );
    }
}
