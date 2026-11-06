package com.traveldesk.backend.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.*;
import com.traveldesk.backend.ai.entity.AIConversation;
import com.traveldesk.backend.ai.entity.AIMessage;
import com.traveldesk.backend.ai.provider.AIProvider;
import com.traveldesk.backend.ai.provider.AIProviderFactory;
import com.traveldesk.backend.ai.tool.AIToolRegistry;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class AIOrchestratorService {

    private static final Logger log = LoggerFactory.getLogger(AIOrchestratorService.class);
    private static final int MAX_TOOL_ITERATIONS = 5;

    private final AIProviderFactory providerFactory;
    private final AIToolRegistry toolRegistry;
    private final AIConversationService conversationService;
    private final AIUsageService usageService;
    private final ObjectMapper objectMapper;

    public AIOrchestratorService(
            AIProviderFactory providerFactory,
            AIToolRegistry toolRegistry,
            AIConversationService conversationService,
            AIUsageService usageService,
            ObjectMapper objectMapper
    ) {
        this.providerFactory = providerFactory;
        this.toolRegistry = toolRegistry;
        this.conversationService = conversationService;
        this.usageService = usageService;
        this.objectMapper = objectMapper;
    }

    /**
     * Executes the conversational AI orchestration loop:
     * 1. Ingests user message and system instructions tailored to role & company.
     * 2. Inspects available role-filtered tools.
     * 3. Orchestrates multi-turn LLM reasoning and tool execution.
     * 4. Persists the response, tracks token usage, and returns clean chat response.
     */
    @Transactional
    public AIChatResponse processChat(
            Company company,
            User user,
            AIConversation conversation,
            String userPrompt
    ) {
        // 1. Quota & Rate Limit verification
        usageService.validateUsageQuota(company, user);

        // 2. Persist incoming user message
        conversationService.appendMessage(
                conversation,
                "USER",
                userPrompt,
                null,
                null,
                0L,
                0L,
                null,
                null
        );

        // 3. Prepare Prompt Messages
        List<AIChatMessage> messages = new ArrayList<>();
        messages.add(buildSystemMessage(company, user));

        // Load recent history (last 10 messages for context)
        List<AIMessageResponse> history = conversationService.getMessages(conversation.getId(), company, user);
        int startIdx = Math.max(0, history.size() - 10);
        for (int i = startIdx; i < history.size(); i++) {
            AIMessageResponse m = history.get(i);
            AIChatRole role = "USER".equalsIgnoreCase(m.senderType()) ? AIChatRole.USER : AIChatRole.ASSISTANT;
            messages.add(new AIChatMessage(role, m.content()));
        }

        // 4. Retrieve role-authorized tools
        List<AIToolDefinition> authorizedTools = toolRegistry.getAuthorizedToolDefinitions(user);

        // 5. Orchestration Loop
        AIProvider provider = providerFactory.getActiveProvider();
        long totalTokensIn = 0L;
        long totalTokensOut = 0L;
        String finalContent = null;
        Object structuredDataPayload = null;
        List<AIToolCall> executedToolCalls = new ArrayList<>();

        int iteration = 0;
        while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            AICompletionRequest request = new AICompletionRequest(
                    messages,
                    authorizedTools.isEmpty() ? null : authorizedTools
            );

            AICompletionResponse response = provider.complete(request);
            totalTokensIn += response.getTokensIn();
            totalTokensOut += response.getTokensOut();

            AIChatMessage reply = response.getMessage();

            // Case A: Model requested tool execution
            if (reply.hasToolCalls()) {
                messages.add(reply);
                for (AIToolCall toolCall : reply.getToolCalls()) {
                    executedToolCalls.add(toolCall);
                    log.info("AI invoked tool: {} with arguments: {}", toolCall.name(), toolCall.argumentsJson());

                    String toolResult = toolRegistry.executeTool(user, toolCall.name(), toolCall.argumentsJson());

                    // Try to capture structured data for the frontend drawer/charts
                    try {
                        structuredDataPayload = objectMapper.readValue(toolResult, new TypeReference<Object>() {});
                    } catch (Exception ignored) {
                        structuredDataPayload = toolResult;
                    }

                    // Feed tool result back to the model as TOOL role
                    messages.add(AIChatMessage.tool(toolCall.id(), toolResult));
                }
            } else {
                // Case B: Final textual answer synthesized
                finalContent = reply.getContent() != null ? reply.getContent().trim() : "";
                break;
            }
        }

        if (finalContent == null || finalContent.isBlank()) {
            finalContent = "I analyzed the corporate travel ledger records for " + company.getName() + ", but could not synthesize a complete summary. Please refine your query.";
        }

        // 6. Record usage metrics
        String modelName = providerFactory.getActiveModel();
        usageService.recordUsage(
                company,
                user,
                conversation.getId(),
                provider.getProviderName(),
                modelName,
                totalTokensIn,
                totalTokensOut
        );

        // 7. Persist Assistant Response
        AIMessage savedMsg = conversationService.appendMessage(
                conversation,
                "ASSISTANT",
                finalContent,
                structuredDataPayload,
                executedToolCalls.isEmpty() ? null : executedToolCalls,
                totalTokensIn,
                totalTokensOut,
                modelName,
                provider.getProviderName()
        );

        Map<String, Object> structuredMap = null;
        if (structuredDataPayload instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> casted = (Map<String, Object>) structuredDataPayload;
            structuredMap = casted;
        }

        return AIChatResponse.of(
                conversation.getId(),
                savedMsg.getId(),
                finalContent,
                structuredMap,
                totalTokensIn,
                totalTokensOut,
                modelName,
                provider.getProviderName()
        );
    }

    private AIChatMessage buildSystemMessage(Company company, User user) {
        String roleName = user.getRole() != null ? user.getRole().name() : "EMPLOYEE";
        String userName = user.getUsername();

        StringBuilder sb = new StringBuilder();
        sb.append("You are Trapple AI, the intelligent corporate travel management and business intelligence assistant for ");
        sb.append(company.getName()).append(" (Company Code: ").append(company.getCode()).append(").\n\n");

        sb.append("Current Authenticated User Context:\n");
        sb.append("- Username: ").append(userName).append("\n");
        sb.append("- Role: ").append(roleName).append("\n\n");

        sb.append("CRITICAL INSTRUCTIONS & ACCURACY RULES:\n");
        sb.append("1. Always query the provided corporate ledger tools to retrieve verified financial and travel data before answering questions about spend, projects, or employees. Never guess, invent, or extrapolate figures.\n");
        sb.append("2. FINANCIAL RECONCILIATION: Net Spend = Gross Spend - Credit Notes / Refunds (Decision 3). Always present gross spend, credit notes deducted, and net spend clearly.\n");
        sb.append("3. ZERO-FARE TRANSIT: Intermediate multi-city layovers or zero-fare transit legs are tracked but do not contribute duplicate cost (Decision 4).\n");
        sb.append("4. CURRENCY: All amounts are in Indian Rupees (₹) by default. Format numbers with commas and currency signs (e.g. ₹1,24,500.00).\n");
        sb.append("5. ROLE PERMISSIONS: Standard Employees can only view their own personal travel history and bookings. Management, Travel Desk, and Admins can view department, company-wide, and project analytics.\n");
        sb.append("6. FORMATTING: Use clean markdown with headers, bullet points, and tables where appropriate to present clear, executive-ready summaries.\n");

        return AIChatMessage.system(sb.toString());
    }
}
