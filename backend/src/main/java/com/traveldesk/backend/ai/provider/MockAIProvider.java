package com.traveldesk.backend.ai.provider;

import com.traveldesk.backend.ai.dto.AIChatMessage;
import com.traveldesk.backend.ai.dto.AICompletionRequest;
import com.traveldesk.backend.ai.dto.AICompletionResponse;
import com.traveldesk.backend.ai.dto.AIToolCall;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

@Component
public class MockAIProvider implements AIProvider {

    public static final String PROVIDER_NAME = "mock";

    @Override
    public String getProviderName() {
        return PROVIDER_NAME;
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    @Override
    public AICompletionResponse complete(AICompletionRequest request) {
        List<AIChatMessage> messages = request.getMessages();
        String lastUserPrompt = "";
        for (int i = messages.size() - 1; i >= 0; i--) {
            if (messages.get(i).getRole() == com.traveldesk.backend.ai.dto.AIChatRole.USER) {
                lastUserPrompt = messages.get(i).getContent() != null ? messages.get(i).getContent().trim() : "";
                break;
            }
        }

        String lowerPrompt = lastUserPrompt.toLowerCase();

        AIChatMessage lastMsg = messages.isEmpty() ? null : messages.get(messages.size() - 1);
        boolean hasToolResult = lastMsg != null && lastMsg.getRole() == com.traveldesk.backend.ai.dto.AIChatRole.TOOL;

        // 1. If tool result was just provided, synthesize response based on tool result
        if (hasToolResult) {
            String toolContent = lastMsg.getContent() != null ? lastMsg.getContent() : "{}";
            String reply = "Trapple AI Assistant: Verified company travel ledger records retrieved:\n" + toolContent;
            AIChatMessage msg = AIChatMessage.assistant(reply);
            return new AICompletionResponse(msg, "stop", 60L, 40L, "mock-model", PROVIDER_NAME);
        }

        // 2. If tools are requested and prompt mentions spend or overview, mock tool invocation
        if (request.hasTools() && (lowerPrompt.contains("spend") || lowerPrompt.contains("overview") || lowerPrompt.contains("october") || lowerPrompt.contains("project"))) {
            String toolName = lowerPrompt.contains("project") ? "get_project_spend_analysis" : "get_executive_spend_overview";
            AIToolCall toolCall = new AIToolCall("call_mock_001", toolName, "{\"period\":\"ALL_TIME\"}");
            AIChatMessage msg = AIChatMessage.assistantToolCalls(Collections.singletonList(toolCall));
            return new AICompletionResponse(msg, "tool_calls", 50L, 20L, "mock-model", PROVIDER_NAME);
        }

        // 2. Default mock answer
        String reply = "Trapple AI Assistant: Analyzed your request regarding \"" + lastUserPrompt + "\".";
        AIChatMessage msg = AIChatMessage.assistant(reply);
        return new AICompletionResponse(msg, "stop", 40L, 30L, "mock-model", PROVIDER_NAME);
    }
}

