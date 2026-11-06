package com.traveldesk.backend.ai.dto;

import jakarta.validation.constraints.NotNull;

public record AIFeedbackRequest(
        @NotNull(message = "messageId is required")
        Long messageId,
        @NotNull(message = "rating is required")
        String rating, // THUMBS_UP, THUMBS_DOWN
        String feedbackText
) {}

