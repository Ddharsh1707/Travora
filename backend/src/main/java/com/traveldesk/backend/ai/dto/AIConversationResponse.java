package com.traveldesk.backend.ai.dto;

import com.traveldesk.backend.ai.entity.AIConversation;
import java.time.LocalDateTime;

public record AIConversationResponse(
        Long id,
        String title,
        String userRole,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        long messageCount
) {
    public static AIConversationResponse from(AIConversation conv, long count) {
        return new AIConversationResponse(
                conv.getId(),
                conv.getTitle(),
                conv.getUserRole(),
                conv.getCreatedAt(),
                conv.getUpdatedAt(),
                count
        );
    }
}

