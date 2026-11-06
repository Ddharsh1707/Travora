package com.traveldesk.backend.ai.dto;

import java.util.List;
import java.util.Map;

public record AIChatResponse(
        Long conversationId,
        Long messageId,
        String answerText,
        String responseType, // TEXT, TABLE, KPI, CHART, ACTION_CONFIRMATION
        Map<String, Object> structuredData,
        List<Map<String, Object>> charts,
        List<String> sources,
        String reportingPeriod,
        String filtersApplied,
        String calculationBasis,
        List<String> limitations,
        boolean requiresConfirmation,
        Map<String, Object> usageMetadata
) {
    public static AIChatResponse of(
            Long conversationId,
            Long messageId,
            String answerText,
            Map<String, Object> structuredData,
            long tokensIn,
            long tokensOut,
            String model,
            String provider
    ) {
        Map<String, Object> usage = Map.of(
                "provider", provider != null ? provider : "mock",
                "model", model != null ? model : "mock-model",
                "tokensIn", tokensIn,
                "tokensOut", tokensOut,
                "totalTokens", (tokensIn + tokensOut)
        );

        String type = (structuredData != null && !structuredData.isEmpty()) ? "KPI" : "TEXT";

        return new AIChatResponse(
                conversationId,
                messageId,
                answerText,
                type,
                structuredData,
                java.util.Collections.emptyList(),
                java.util.Collections.singletonList("Trapple Corporate Travel Database"),
                "All recorded history",
                null,
                "Decision 3: Net Spend = Gross Spend - Credit Notes / Refunds",
                java.util.Collections.emptyList(),
                false,
                usage
        );
    }
}
