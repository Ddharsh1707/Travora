package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.spendintelligence.SpendFilter;
import com.traveldesk.backend.spendintelligence.TravelSpendService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class ModalSplitAnalysisTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(ModalSplitAnalysisTool.class);
    public static final String TOOL_NAME = "get_modal_split_analysis";

    private final TravelSpendService travelSpendService;
    private final ObjectMapper objectMapper;

    public ModalSplitAnalysisTool(TravelSpendService travelSpendService, ObjectMapper objectMapper) {
        this.travelSpendService = travelSpendService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Get travel spend split across different modes of transport (Flights, Hotels, Trains, Cabs/Cars) " +
                "including booking counts, gross spend, credit note deductions, and net spend.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> deptProp = new LinkedHashMap<>();
        deptProp.put("type", "string");
        deptProp.put("description", "Optional department name");
        props.put("department", deptProp);

        Map<String, Object> periodProp = new LinkedHashMap<>();
        periodProp.put("type", "string");
        periodProp.put("description", "Time period filter: ALL_TIME, CURRENT_FY, LAST_FY, THIS_MONTH, THIS_QUARTER");
        props.put("period", periodProp);

        Map<String, Object> fromProp = new LinkedHashMap<>();
        fromProp.put("type", "string");
        fromProp.put("description", "Optional start date in YYYY-MM-DD format");
        props.put("fromDate", fromProp);

        Map<String, Object> toProp = new LinkedHashMap<>();
        toProp.put("type", "string");
        toProp.put("description", "Optional end date in YYYY-MM-DD format");
        props.put("toDate", toProp);

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
                   " is not authorized to access modal split analysis.\"}";
        }

        try {
            String department = arguments != null && arguments.get("department") != null ? String.valueOf(arguments.get("department")) : null;
            String period = arguments != null && arguments.get("period") != null ? String.valueOf(arguments.get("period")) : null;

            LocalDate fromDate = null;
            if (arguments != null && arguments.get("fromDate") != null) {
                try {
                    fromDate = LocalDate.parse(String.valueOf(arguments.get("fromDate")).trim());
                } catch (Exception ignored) {}
            }

            LocalDate toDate = null;
            if (arguments != null && arguments.get("toDate") != null) {
                try {
                    toDate = LocalDate.parse(String.valueOf(arguments.get("toDate")).trim());
                } catch (Exception ignored) {}
            }

            SpendFilter filter = new SpendFilter(
                    null, department, null, null, null, null, period, fromDate, toDate, null, null, null
            );

            var summary = travelSpendService.getModalSplitAnalysis(user, filter);
            return objectMapper.writeValueAsString(summary);

        } catch (Exception e) {
            log.error("Error executing ModalSplitAnalysisTool", e);
            return "{\"error\":\"Failed to retrieve modal split analysis: " + e.getMessage() + "\"}";
        }
    }
}

