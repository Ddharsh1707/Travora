package com.traveldesk.backend.ai.dto;

public enum AIChatRole {
    SYSTEM,
    USER,
    ASSISTANT,
    TOOL;

    public String toApiValue() {
        return name().toLowerCase();
    }

    public static AIChatRole fromApiValue(String val) {
        if (val == null) return USER;
        return switch (val.trim().toLowerCase()) {
            case "system" -> SYSTEM;
            case "assistant" -> ASSISTANT;
            case "tool" -> TOOL;
            default -> USER;
        };
    }
}

