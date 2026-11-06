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
public class EmployeeSpendAnalysisTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(EmployeeSpendAnalysisTool.class);
    public static final String TOOL_NAME = "get_employee_spend_analysis";

    private final TravelSpendService travelSpendService;
    private final ObjectMapper objectMapper;

    public EmployeeSpendAnalysisTool(TravelSpendService travelSpendService, ObjectMapper objectMapper) {
        this.travelSpendService = travelSpendService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Get employee travel spend analysis. If an employee identifier or name is specified, retrieves their " +
                "detailed multi-leg travel history, bookings, and expenditure. If omitted, returns top spending employees. " +
                "Regular employees can only access their own travel data.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> empProp = new LinkedHashMap<>();
        empProp.put("type", "string");
        empProp.put("description", "Employee code (e.g. 'EMP101', 'MISPL042') or passenger name to look up");
        props.put("employeeIdentifier", empProp);

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
        return user != null;
    }

    @Override
    public String execute(User user, Map<String, Object> arguments) {
        if (!isAuthorized(user)) {
            return "{\"error\":\"Access denied: Unauthenticated user.\"}";
        }

        try {
            String empId = arguments != null && arguments.get("employeeIdentifier") != null ?
                    String.valueOf(arguments.get("employeeIdentifier")).trim() : null;
            String department = arguments != null && arguments.get("department") != null ?
                    String.valueOf(arguments.get("department")).trim() : null;
            String period = arguments != null && arguments.get("period") != null ?
                    String.valueOf(arguments.get("period")).trim() : null;

            // Restrict regular employees to their own employee identifier
            if (user.getRole() == Role.EMPLOYEE) {
                String ownId = user.getUsername();
                if (empId != null && !empId.equalsIgnoreCase(ownId)) {
                    return "{\"error\":\"Access denied: Employees can only view their own travel records.\"}";
                }
                empId = ownId;
            }

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

            // If a specific employee is targeted, fetch their detailed history
            if (empId != null && !empId.isBlank()) {
                var detail = travelSpendService.getEmployeeDetailedHistory(user, empId);
                return objectMapper.writeValueAsString(detail);
            }

            // Otherwise, get employee spend summaries across company
            SpendFilter filter = new SpendFilter(
                    null, department, null, null, null, null, period, fromDate, toDate, null, null, null
            );
            var summaries = travelSpendService.getEmployeeSpendAnalysis(user, filter);
            return objectMapper.writeValueAsString(summaries);

        } catch (Exception e) {
            log.error("Error executing EmployeeSpendAnalysisTool", e);
            return "{\"error\":\"Failed to retrieve employee spend analysis: " + e.getMessage() + "\"}";
        }
    }
}

