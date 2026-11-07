package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.expense.Expense;
import com.traveldesk.backend.expense.ExpenseRepository;
import com.traveldesk.backend.expense.ExpenseStatus;
import com.traveldesk.backend.travelrequest.TravelRequest;
import com.traveldesk.backend.travelrequest.TravelRequestRepository;
import com.traveldesk.backend.travelrequest.TravelRequestStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class PendingApprovalsTool implements AITool {

    private static final Logger log = LoggerFactory.getLogger(PendingApprovalsTool.class);
    public static final String TOOL_NAME = "get_pending_approvals";

    private final TravelRequestRepository travelRequestRepository;
    private final ExpenseRepository expenseRepository;
    private final ObjectMapper objectMapper;

    public PendingApprovalsTool(
            TravelRequestRepository travelRequestRepository,
            ExpenseRepository expenseRepository,
            ObjectMapper objectMapper
    ) {
        this.travelRequestRepository = travelRequestRepository;
        this.expenseRepository = expenseRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getDescription() {
        return "Get pending travel requests and expense approval items awaiting manager or travel desk sign-off in the user's company.";
    }

    @Override
    public AIToolDefinition getDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> typeProp = new LinkedHashMap<>();
        typeProp.put("type", "string");
        typeProp.put("description", "Type of items to check: ALL, TRAVEL_REQUESTS, EXPENSES");
        props.put("itemType", typeProp);

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", props);

        return new AIToolDefinition(TOOL_NAME, getDescription(), schema);
    }

    @Override
    public boolean isAuthorized(User user) {
        if (user == null || user.getRole() == null) return false;
        Role r = user.getRole();
        return r == Role.APPROVER || r == Role.TRAVEL_DESK || r == Role.ADMIN ||
               r == Role.COMPANY_ADMIN || r == Role.PLATFORM_ADMIN;
    }

    @Override
    public String execute(User user, Map<String, Object> arguments) {
        if (!isAuthorized(user)) {
            return "{\"error\":\"Access denied: Role " + (user != null ? user.getRole() : "UNKNOWN") +
                   " is not authorized to view pending approvals.\"}";
        }

        if (user.getCompany() == null) {
            return "{\"error\":\"User is not assigned to an active company tenant.\"}";
        }

        try {
            Long companyId = user.getCompany().getId();
            String itemType = arguments != null && arguments.get("itemType") != null ?
                    String.valueOf(arguments.get("itemType")).trim().toUpperCase() : "ALL";

            Map<String, Object> result = new LinkedHashMap<>();

            if ("ALL".equals(itemType) || "TRAVEL_REQUESTS".equals(itemType)) {
                List<TravelRequest> reqs = travelRequestRepository.findByCompanyIdAndStatus(companyId, TravelRequestStatus.PENDING);
                List<Map<String, Object>> reqList = new ArrayList<>();
                for (TravelRequest tr : reqs) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", tr.getId());
                    item.put("employeeName", tr.getEmployee() != null ? tr.getEmployee().getName() : "Unknown");
                    item.put("employeeId", tr.getEmployee() != null ? tr.getEmployee().getEmployeeId() : "");
                    item.put("fromLocation", tr.getFromLocation());
                    item.put("toLocation", tr.getToLocation());
                    item.put("travelDate", tr.getTravelDate() != null ? tr.getTravelDate().toString() : null);
                    item.put("returnDate", tr.getReturnDate() != null ? tr.getReturnDate().toString() : null);
                    item.put("status", tr.getStatus().name());
                    item.put("projectName", tr.getProjectName());
                    reqList.add(item);
                }
                result.put("pendingTravelRequests", reqList);
                result.put("totalPendingTravelRequests", reqList.size());
            }

            if ("ALL".equals(itemType) || "EXPENSES".equals(itemType)) {
                List<Expense> expenses = expenseRepository.findByCompanyIdAndStatus(companyId, ExpenseStatus.SUBMITTED);
                List<Map<String, Object>> expList = new ArrayList<>();
                for (Expense ex : expenses) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", ex.getId());
                    item.put("employeeName", ex.getEmployee() != null ? ex.getEmployee().getName() : "Unknown");
                    item.put("employeeId", ex.getEmployee() != null ? ex.getEmployee().getEmployeeId() : "");
                    item.put("category", ex.getCategory() != null ? ex.getCategory().name() : "");
                    item.put("amount", ex.getAmount());
                    item.put("currency", ex.getCurrency());
                    item.put("expenseDate", ex.getExpenseDate() != null ? ex.getExpenseDate().toString() : null);
                    item.put("status", ex.getStatus().name());
                    expList.add(item);
                }
                result.put("pendingExpenses", expList);
                result.put("totalPendingExpenses", expList.size());
            }

            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("Error executing PendingApprovalsTool", e);
            return "{\"error\":\"Failed to retrieve pending approvals: " + e.getMessage() + "\"}";
        }
    }
}
