package com.traveldesk.backend.ai.dto;

public record AIToolCall(
        String id,
        String name,
        String argumentsJson
) {}

