package com.traveldesk.backend.ai.provider;

import com.traveldesk.backend.ai.dto.AICompletionRequest;
import com.traveldesk.backend.ai.dto.AICompletionResponse;

public interface AIProvider {

    /**
     * Normalized provider identifier, e.g. "openai", "gemini", "mock".
     */
    String getProviderName();

    /**
     * Whether the provider is enabled and configured with required credentials.
     */
    boolean isAvailable();

    /**
     * Complete a conversation turn with optional tool calls.
     */
    AICompletionResponse complete(AICompletionRequest request);
}

