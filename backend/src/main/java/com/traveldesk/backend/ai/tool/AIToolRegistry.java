package com.traveldesk.backend.ai.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AIToolRegistry {

    private static final Logger log = LoggerFactory.getLogger(AIToolRegistry.class);

    private final Map<String, AITool> toolsByName = new HashMap<>();
    private final ObjectMapper objectMapper;

    public AIToolRegistry(List<AITool> tools, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        for (AITool tool : tools) {
            String primary = normalize(tool.getName());
            toolsByName.put(primary, tool);
            // Also register camelCase / aliases if different
            String raw = tool.getName().toLowerCase();
            toolsByName.put(raw, tool);
            log.info("Registered AI tool: {} ({})", tool.getName(), tool.getClass().getSimpleName());
        }
    }

    /**
     * Returns definition schemas of all tools authorized for the current user's role.
     */
    public List<AIToolDefinition> getAuthorizedToolDefinitions(User user) {
        List<AIToolDefinition> definitions = new ArrayList<>();
        Set<String> processed = new HashSet<>();

        for (AITool tool : toolsByName.values()) {
            if (processed.add(tool.getName()) && tool.isAuthorized(user)) {
                definitions.add(tool.getDefinition());
            }
        }
        return definitions;
    }

    /**
     * Executes a tool by name with arguments parsed from JSON string.
     */
    public String executeTool(User user, String toolName, String argumentsJson) {
        if (toolName == null || toolName.isBlank()) {
            return "{\"error\":\"Missing tool name\"}";
        }

        AITool tool = findTool(toolName);
        if (tool == null) {
            log.warn("AI tool not found: {}", toolName);
            return "{\"error\":\"Unknown tool: " + toolName + "\"}";
        }

        if (!tool.isAuthorized(user)) {
            log.warn("Unauthorized attempt to invoke tool {} by user {}", toolName, user != null ? user.getUsername() : "null");
            return "{\"error\":\"Access denied: User is not authorized to invoke " + toolName + "\"}";
        }

        Map<String, Object> arguments = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank() && !argumentsJson.trim().equals("{}")) {
            try {
                arguments = objectMapper.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                log.warn("Failed to parse tool arguments JSON: {}", argumentsJson, e);
                return "{\"error\":\"Invalid arguments JSON: " + e.getMessage() + "\"}";
            }
        }

        try {
            log.info("Executing AI tool {} for user {}", tool.getName(), user != null ? user.getUsername() : "null");
            return tool.execute(user, arguments);
        } catch (Exception e) {
            log.error("Unhandled error executing tool {}", toolName, e);
            return "{\"error\":\"Error executing " + toolName + ": " + e.getMessage() + "\"}";
        }
    }

    private AITool findTool(String name) {
        String key = normalize(name);
        AITool tool = toolsByName.get(key);
        if (tool != null) return tool;

        // Try raw lower-case without underscores
        String clean = key.replace("_", "");
        for (Map.Entry<String, AITool> entry : toolsByName.entrySet()) {
            if (entry.getKey().replace("_", "").equalsIgnoreCase(clean)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private String normalize(String name) {
        return name.trim().toLowerCase();
    }
}

