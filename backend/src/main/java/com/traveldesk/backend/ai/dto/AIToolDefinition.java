package com.traveldesk.backend.ai.dto;

import java.util.Map;

public record AIToolDefinition(
        String name,
        String description,
        Map<String, Object> parametersSchema
) {}

