package com.traveldesk.backend.ai.dto;

import java.util.Collections;
import java.util.List;

public class AICompletionResponse {

    private AIChatMessage message;
    private String finishReason;
    private long tokensIn;
    private long tokensOut;
    private String model;
    private String provider;

    public AICompletionResponse() {
    }

    public AICompletionResponse(
            AIChatMessage message,
            String finishReason,
            long tokensIn,
            long tokensOut,
            String model,
            String provider
    ) {
        this.message = message;
        this.finishReason = finishReason;
        this.tokensIn = tokensIn;
        this.tokensOut = tokensOut;
        this.model = model;
        this.provider = provider;
    }

    public AIChatMessage getMessage() {
        return message;
    }

    public void setMessage(AIChatMessage message) {
        this.message = message;
    }

    public String getContent() {
        return message != null ? message.getContent() : null;
    }

    public boolean isToolCall() {
        return message != null && message.hasToolCalls();
    }

    public List<AIToolCall> getToolCalls() {
        return message != null ? message.getToolCalls() : Collections.emptyList();
    }

    public String getFinishReason() {
        return finishReason;
    }

    public void setFinishReason(String finishReason) {
        this.finishReason = finishReason;
    }

    public long getTokensIn() {
        return tokensIn;
    }

    public void setTokensIn(long tokensIn) {
        this.tokensIn = tokensIn;
    }

    public long getTokensOut() {
        return tokensOut;
    }

    public void setTokensOut(long tokensOut) {
        this.tokensOut = tokensOut;
    }

    public long getTotalTokens() {
        return tokensIn + tokensOut;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }
}

