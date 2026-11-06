package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.importdata.ImportBatch;
import com.traveldesk.backend.importdata.ImportBatchRepository;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class ImportReconciliationTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(ImportReconciliationTool.class);
    public static final String TOOL_NAME = "analyze_import_batch";

    private final ImportBatchRepository batchRepository;
    private final ImportedTravelRecordRepository recordRepository;
    private final ObjectMapper objectMapper;

    public ImportReconciliationTool(
            ImportBatchRepository batchRepository,
            ImportedTravelRecordRepository recordRepository,
            ObjectMapper objectMapper
    ) {
        this.batchRepository = batchRepository;
        this.recordRepository = recordRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Audit uploaded Excel/CSV travel batches for data quality, detecting unmapped passenger names, " +
                "missing employee codes, unallocated project cost centers, and credit note reconciliations.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> idProp = new LinkedHashMap<>();
        idProp.put("type", "number");
        idProp.put("description", "Optional Import Batch ID to inspect. If omitted, analyzes the most recent upload.");
        props.put("batchId", idProp);

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", props);

        return new AIToolDefinition(TOOL_NAME, getDescription(), schema);
    }

    @Override
    public boolean isAuthorized(User user) {
        if (user == null || user.getRole() == null) return false;
        Role r = user.getRole();
        return r == Role.TRAVEL_DESK || r == Role.ADMIN || r == Role.COMPANY_ADMIN || r == Role.PLATFORM_ADMIN;
    }

    @Override
    public String execute(User user, Map<String, Object> arguments) {
        if (!isAuthorized(user)) {
            return "{\"error\":\"Access denied: Role " + (user != null ? user.getRole() : "UNKNOWN") +
                   " is not authorized to inspect import batches.\"}";
        }

        if (user.getCompany() == null) {
            return "{\"error\":\"User is not assigned to an active company.\"}";
        }

        try {
            Long companyId = user.getCompany().getId();
            Long batchId = null;
            if (arguments != null && arguments.get("batchId") != null) {
                try {
                    batchId = Long.valueOf(String.valueOf(arguments.get("batchId")).trim());
                } catch (Exception ignored) {}
            }

            ImportBatch batch = null;
            if (batchId != null) {
                batch = batchRepository.findById(batchId)
                        .filter(b -> b.getCompany().getId().equals(companyId))
                        .orElse(null);
            } else {
                List<ImportBatch> recent = batchRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
                if (!recent.isEmpty()) {
                    batch = recent.get(0);
                }
            }

            if (batch == null) {
                return "{\"message\":\"No uploaded travel import batches found for " + user.getCompany().getName() + ".\"}";
            }

            List<ImportedTravelRecord> records = recordRepository.findByImportBatchId(batch.getId());

            int unmappedEmployees = 0;
            int unallocatedProjects = 0;
            int creditNotesFound = 0;
            Set<String> sampleUnmappedNames = new LinkedHashSet<>();
            Set<String> sampleUnallocatedRows = new LinkedHashSet<>();

            for (ImportedTravelRecord r : records) {
                if (r.getEmployee() == null) {
                    unmappedEmployees++;
                    if (sampleUnmappedNames.size() < 5) {
                        String name = r.getRawEmployeeName() != null ? r.getRawEmployeeName() : r.getRawEmployeeIdentifier();
                        if (name != null && !name.isBlank()) sampleUnmappedNames.add(name);
                    }
                }

                if (r.getProject() == null && (r.getProjectName() == null || r.getProjectName().isBlank())) {
                    unallocatedProjects++;
                    if (sampleUnallocatedRows.size() < 5 && r.getTicketReference() != null) {
                        sampleUnallocatedRows.add(r.getTicketReference());
                    }
                }

                if (r.isCreditNote()) {
                    creditNotesFound++;
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("batchId", batch.getId());
            result.put("filename", batch.getOriginalFilename() != null ? batch.getOriginalFilename() : batch.getFilename());
            result.put("status", batch.getStatus());
            result.put("totalRows", batch.getTotalRows());
            result.put("validRows", batch.getValidRows());
            result.put("errorRows", batch.getErrorRows());
            result.put("unmappedEmployeesCount", unmappedEmployees);
            result.put("sampleUnmappedNames", sampleUnmappedNames);
            result.put("unallocatedProjectsCount", unallocatedProjects);
            result.put("sampleUnallocatedTickets", sampleUnallocatedRows);
            result.put("creditNotesCount", creditNotesFound);

            List<String> recommendations = new ArrayList<>();
            if (unmappedEmployees > 0) {
                recommendations.add("Map " + unmappedEmployees + " passenger names to registered employee profiles before finalizing import.");
            }
            if (unallocatedProjects > 0) {
                recommendations.add("Assign client projects or departmental cost centers to " + unallocatedProjects + " unallocated booking rows.");
            }
            if (creditNotesFound > 0) {
                recommendations.add("Verified " + creditNotesFound + " credit notes in batch. Ensure original ticket numbers are cross-referenced (Decision 3).");
            }
            if (recommendations.isEmpty()) {
                recommendations.add("Batch data quality is high. Ready for final commit.");
            }
            result.put("recommendations", recommendations);

            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("Error executing ImportReconciliationTool", e);
            return "{\"error\":\"Failed to analyze import batch: " + e.getMessage() + "\"}";
        }
    }
}

