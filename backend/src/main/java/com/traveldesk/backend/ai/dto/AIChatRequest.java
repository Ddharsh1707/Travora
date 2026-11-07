package com.traveldesk.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public class AIChatRequest {

    private Long conversationId;

    @NotBlank(message = "Prompt message cannot be blank")
    private String message;

    private Map<String, Object> filters;
    private Map<String, Object> clientContext;

    public AIChatRequest() {
    }

    public AIChatRequest(String message) {
        this.message = message;
    }

    public AIChatRequest(Long conversationId, String message) {
        this.conversationId = conversationId;
        this.message = message;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public void setConversationId(Long conversationId) {
        this.conversationId = conversationId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Map<String, Object> getFilters() {
        return filters;
    }

    public void setFilters(Map<String, Object> filters) {
        this.filters = filters;
    }

    public Map<String, Object> getClientContext() {
        return clientContext;
    }

    public void setClientContext(Map<String, Object> clientContext) {
        this.clientContext = clientContext;
    }
}

