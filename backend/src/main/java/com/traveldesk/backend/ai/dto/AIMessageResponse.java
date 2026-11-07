package com.traveldesk.backend.ai.dto;

import com.traveldesk.backend.ai.entity.AIMessage;
import java.time.LocalDateTime;

public record AIMessageResponse(
        Long id,
        String senderType,
        String content,
        String structuredData,
        String toolCalls,
        Long tokensIn,
        Long tokensOut,
        String model,
        LocalDateTime createdAt
) {
    public static AIMessageResponse from(AIMessage msg) {
        return new AIMessageResponse(
                msg.getId(),
                msg.getSenderType(),
                msg.getContent(),
                msg.getStructuredData(),
                msg.getToolCalls(),
                msg.getTokensIn(),
                msg.getTokensOut(),
                msg.getModel(),
                msg.getCreatedAt()
        );
    }
}

