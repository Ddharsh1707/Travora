package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;

@Component
public class TravelAnomalyDetectionTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(TravelAnomalyDetectionTool.class);
    public static final String TOOL_NAME = "detect_travel_anomalies";

    private final ImportedTravelRecordRepository recordRepository;
    private final ObjectMapper objectMapper;

    public TravelAnomalyDetectionTool(
            ImportedTravelRecordRepository recordRepository,
            ObjectMapper objectMapper
    ) {
        this.recordRepository = recordRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Scan corporate travel ledger for cost spikes, domestic flight fares exceeding policy thresholds (>₹20,000), " +
                "unmatched credit notes missing original ticket references, and unallocated project expenditures.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> thresholdProp = new LinkedHashMap<>();
        thresholdProp.put("type", "number");
        thresholdProp.put("description", "Fare amount threshold in INR to flag high-cost trips (default: 20000)");
        props.put("thresholdAmount", thresholdProp);

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", props);

        return new AIToolDefinition(TOOL_NAME, getDescription(), schema);
    }

    @Override
    public boolean isAuthorized(User user) {
        if (user == null || user.getRole() == null) return false;
        Role r = user.getRole();
        return r == Role.ADMIN || r == Role.COMPANY_ADMIN || r == Role.PLATFORM_ADMIN ||
               r == Role.TRAVEL_DESK || r == Role.APPROVER;
    }

    @Override
    public String execute(User user, Map<String, Object> arguments) {
        if (!isAuthorized(user)) {
            return "{\"error\":\"Access denied: Role " + (user != null ? user.getRole() : "UNKNOWN") +
                   " is not authorized to run travel anomaly detection.\"}";
        }

        if (user.getCompany() == null) {
            return "{\"error\":\"User is not assigned to an active company.\"}";
        }

        try {
            Long companyId = user.getCompany().getId();
            BigDecimal threshold = BigDecimal.valueOf(20000);
            if (arguments != null && arguments.get("thresholdAmount") != null) {
                try {
                    threshold = new BigDecimal(String.valueOf(arguments.get("thresholdAmount")).trim());
                } catch (Exception ignored) {}
            }

            List<ImportedTravelRecord> records = recordRepository.findByCompanyId(companyId);

            List<Map<String, Object>> anomalies = new ArrayList<>();
            int fareSpikesCount = 0;
            int creditNoteMismatches = 0;
            int unallocatedCount = 0;

            for (ImportedTravelRecord r : records) {
                // 1. Check for single ticket fare spikes on domestic flights
                if (!r.isCreditNote() && r.getCost() != null && r.getCost().compareTo(threshold) > 0) {
                    fareSpikesCount++;
                    if (anomalies.size() < 10) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("type", "FARE_SPIKE");
                        item.put("severity", "MEDIUM");
                        item.put("ticketReference", r.getTicketReference());
                        item.put("passenger", r.getRawEmployeeName() != null ? r.getRawEmployeeName() : "Unknown");
                        item.put("route", r.getFromLocation() + " -> " + r.getToLocation());
                        item.put("cost", r.getCost());
                        item.put("travelDate", r.getTravelDate() != null ? r.getTravelDate().toString() : null);
                        item.put("description", "Domestic flight fare of ₹" + r.getCost() + " exceeds policy threshold of ₹" + threshold);
                        anomalies.add(item);
                    }
                }

                // 2. Check for credit notes missing original ticket reference (Decision 3 violation)
                if (r.isCreditNote() && (r.getOriginalTicketReference() == null || r.getOriginalTicketReference().isBlank())) {
                    creditNoteMismatches++;
                    if (anomalies.size() < 15) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("type", "UNLINKED_CREDIT_NOTE");
                        item.put("severity", "HIGH");
                        item.put("ticketReference", r.getTicketReference());
                        item.put("refundAmount", r.getCost());
                        item.put("passenger", r.getRawEmployeeName());
                        item.put("description", "Credit note / refund is not linked to an original ticket reference. Audit required for Decision 3 reconciliation.");
                        anomalies.add(item);
                    }
                }

                // 3. High value unallocated project trips
                if (r.getProject() == null && (r.getProjectName() == null || r.getProjectName().isBlank()) &&
                    r.getCost() != null && r.getCost().compareTo(BigDecimal.valueOf(10000)) > 0) {
                    unallocatedCount++;
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("companyName", user.getCompany().getName());
            result.put("recordsScanned", records.size());
            result.put("fareSpikesCount", fareSpikesCount);
            result.put("unlinkedCreditNotesCount", creditNoteMismatches);
            result.put("highValueUnallocatedCount", unallocatedCount);
            result.put("flaggedAnomalies", anomalies);

            List<String> actionItems = new ArrayList<>();
            if (creditNoteMismatches > 0) {
                actionItems.add("Immediate action: Re-link " + creditNoteMismatches + " unassigned credit notes with original booked ticket references.");
            }
            if (fareSpikesCount > 0) {
                actionItems.add("Audit " + fareSpikesCount + " bookings exceeding ₹" + threshold + " to verify if advance booking policy (POL-SEC-101) was adhered to.");
            }
            if (unallocatedCount > 0) {
                actionItems.add("Assign project cost codes to " + unallocatedCount + " high-value unallocated journeys for client invoicing.");
            }
            if (actionItems.isEmpty()) {
                actionItems.add("No critical anomalies detected in the current travel ledger.");
            }
            result.put("recommendedActions", actionItems);

            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("Error executing TravelAnomalyDetectionTool", e);
            return "{\"error\":\"Failed to run anomaly detection: " + e.getMessage() + "\"}";
        }
    }
}

