package com.traveldesk.backend.ai.dto;

import java.util.Collections;
import java.util.List;

public class AICompletionRequest {

    private List<AIChatMessage> messages;
    private List<AIToolDefinition> tools;
    private Double temperature = 0.2;
    private Integer maxTokens;
    private String model;

    public AICompletionRequest() {
        this.messages = Collections.emptyList();
        this.tools = Collections.emptyList();
    }

    public AICompletionRequest(List<AIChatMessage> messages) {
        this.messages = messages;
        this.tools = Collections.emptyList();
    }

    public AICompletionRequest(List<AIChatMessage> messages, List<AIToolDefinition> tools) {
        this.messages = messages;
        this.tools = tools != null ? tools : Collections.emptyList();
    }

    public List<AIChatMessage> getMessages() {
        return messages != null ? messages : Collections.emptyList();
    }

    public void setMessages(List<AIChatMessage> messages) {
        this.messages = messages;
    }

    public List<AIToolDefinition> getTools() {
        return tools != null ? tools : Collections.emptyList();
    }

    public void setTools(List<AIToolDefinition> tools) {
        this.tools = tools;
    }

    public Double getTemperature() {
        return temperature;
    }

    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }

    public Integer getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public boolean hasTools() {
        return tools != null && !tools.isEmpty();
    }
}

