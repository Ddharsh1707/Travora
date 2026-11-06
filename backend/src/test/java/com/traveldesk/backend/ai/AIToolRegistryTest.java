package com.traveldesk.backend.ai;

import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.ai.tool.AIToolRegistry;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class AIToolRegistryTest {

    @Autowired
    private AIToolRegistry registry;

    private User adminUser;
    private User employeeUser;

    @BeforeEach
    void setUp() {
        Company company = new Company("Alpha Corp", "ALPHA", "alpha.com");

        adminUser = new User();
        adminUser.setUsername("admin_user");
        adminUser.setRole(Role.ADMIN);
        adminUser.setCompany(company);

        employeeUser = new User();
        employeeUser.setUsername("emp_user");
        employeeUser.setRole(Role.EMPLOYEE);
        employeeUser.setCompany(company);
    }

    @Test
    @DisplayName("Admin user receives all registered authorized tools")
    void testAdminToolAuthorization() {
        List<AIToolDefinition> defs = registry.getAuthorizedToolDefinitions(adminUser);
        assertNotNull(defs);
        assertTrue(defs.size() >= 7, "Expected at least 7 authorized tools for ADMIN");
    }

    @Test
    @DisplayName("Employee user only receives personal, route analysis, and policy tools")
    void testEmployeeToolAuthorization() {
        List<AIToolDefinition> defs = registry.getAuthorizedToolDefinitions(employeeUser);
        assertNotNull(defs);
        assertEquals(3, defs.size());
        assertTrue(defs.stream().anyMatch(d -> d.name().equals("get_employee_spend_analysis")));
        assertTrue(defs.stream().anyMatch(d -> d.name().equals("get_popular_routes_analysis")));
        assertTrue(defs.stream().anyMatch(d -> d.name().equals("search_travel_policy")));
    }

    @Test
    @DisplayName("Unauthorized tool execution is rejected")
    void testUnauthorizedExecutionRejection() {
        String result = registry.executeTool(employeeUser, "get_executive_spend_overview", "{}");
        assertTrue(result.contains("Access denied") || result.contains("error"));
    }

    @Test
    @DisplayName("Unknown tool returns clean error JSON")
    void testUnknownToolExecution() {
        String result = registry.executeTool(adminUser, "non_existent_tool", "{}");
        assertTrue(result.contains("Unknown tool"));
    }
}
