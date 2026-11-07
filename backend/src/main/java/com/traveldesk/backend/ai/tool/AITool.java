package com.traveldesk.backend.ai.tool;

import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.auth.User;

import java.util.Map;

/**
 * Common contract for corporate intelligence and workflow tools callable by Trapple AI.
 * Implementations enforce company isolation and role-based permissions.
 */
public interface AITool {

    /**
     * Unique identifier matching LLM function call naming (e.g. get_executive_spend_overview).
     */
    String getName();

    /**
     * Clear, concise description explaining when and why the LLM should invoke this tool.
     */
    String getDescription();

    /**
     * Parameter schema definition conforming to JSON Schema / OpenAI function call definitions.
     */
    AIToolDefinition getDefinition();

    /**
     * Authorization check evaluating whether the current user is permitted to invoke this tool.
     */
    boolean isAuthorized(User user);

    /**
     * Executes the business tool logic and returns a serialized JSON string containing verified results.
     */
    String execute(User user, Map<String, Object> arguments);
}

