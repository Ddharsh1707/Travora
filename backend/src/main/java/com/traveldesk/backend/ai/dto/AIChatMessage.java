package com.traveldesk.backend.ai.dto;

import java.util.Collections;
import java.util.List;

public class AIChatMessage {

    private AIChatRole role;
    private String content;
    private String name;
    private String toolCallId;
    private List<AIToolCall> toolCalls;

    public AIChatMessage() {
    }

    public AIChatMessage(AIChatRole role, String content) {
        this.role = role;
        this.content = content;
        this.toolCalls = Collections.emptyList();
    }

    public AIChatMessage(AIChatRole role, String content, String toolCallId) {
        this.role = role;
        this.content = content;
        this.toolCallId = toolCallId;
        this.toolCalls = Collections.emptyList();
    }

    public AIChatMessage(AIChatRole role, String content, List<AIToolCall> toolCalls) {
        this.role = role;
        this.content = content;
        this.toolCalls = toolCalls != null ? toolCalls : Collections.emptyList();
    }

    public static AIChatMessage system(String content) {
        return new AIChatMessage(AIChatRole.SYSTEM, content);
    }

    public static AIChatMessage user(String content) {
        return new AIChatMessage(AIChatRole.USER, content);
    }

    public static AIChatMessage assistant(String content) {
        return new AIChatMessage(AIChatRole.ASSISTANT, content);
    }

    public static AIChatMessage assistantToolCalls(List<AIToolCall> toolCalls) {
        return new AIChatMessage(AIChatRole.ASSISTANT, null, toolCalls);
    }

    public static AIChatMessage tool(String toolCallId, String content) {
        return new AIChatMessage(AIChatRole.TOOL, content, toolCallId);
    }

    public AIChatRole getRole() {
        return role;
    }

    public void setRole(AIChatRole role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public void setToolCallId(String toolCallId) {
        this.toolCallId = toolCallId;
    }

    public List<AIToolCall> getToolCalls() {
        return toolCalls != null ? toolCalls : Collections.emptyList();
    }

    public void setToolCalls(List<AIToolCall> toolCalls) {
        this.toolCalls = toolCalls;
    }

    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }
}

