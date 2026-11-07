package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.ai.policy.PolicyDocumentService;
import com.traveldesk.backend.auth.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class CorporatePolicyTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(CorporatePolicyTool.class);
    public static final String TOOL_NAME = "search_travel_policy";

    private final PolicyDocumentService policyService;
    private final ObjectMapper objectMapper;

    public CorporatePolicyTool(PolicyDocumentService policyService, ObjectMapper objectMapper) {
        this.policyService = policyService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Search official company corporate travel policy documents, per diem allowances, hotel room caps by city tier, " +
                "advance booking rules, cancellation procedures, and reimbursement claim deadlines with section citations.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> qProp = new LinkedHashMap<>();
        qProp.put("type", "string");
        qProp.put("description", "Search query or keyword (e.g. 'hotel limits', 'per diem', 'cancellations', 'flight class', 'claim deadline')");
        props.put("query", qProp);

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
            String query = arguments != null && arguments.get("query") != null ?
                    String.valueOf(arguments.get("query")).trim() : "";

            var sections = policyService.searchPolicy(user.getCompany(), query);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("companyName", user.getCompany() != null ? user.getCompany().getName() : "Company");
            result.put("policyVersion", "v3.2 - Corporate Travel & Expense Policy");
            result.put("matchingSections", sections);
            result.put("totalSectionsFound", sections.size());

            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("Error executing CorporatePolicyTool", e);
            return "{\"error\":\"Failed to retrieve policy document: " + e.getMessage() + "\"}";
        }
    }
}

