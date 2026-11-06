package com.traveldesk.backend.ai.provider;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.config.AIProperties;
import com.traveldesk.backend.ai.dto.AIChatMessage;
import com.traveldesk.backend.ai.dto.AIChatRole;
import com.traveldesk.backend.ai.dto.AICompletionRequest;
import com.traveldesk.backend.ai.dto.AICompletionResponse;
import com.traveldesk.backend.ai.dto.AIToolCall;
import com.traveldesk.backend.ai.dto.AIToolDefinition;
import com.traveldesk.backend.ai.exception.AIServiceException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Component
public class OpenAIProvider implements AIProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenAIProvider.class);
    public static final String PROVIDER_NAME = "openai";

    private final AIProperties aiProperties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public OpenAIProvider(
            AIProperties aiProperties,
            @org.springframework.beans.factory.annotation.Autowired(required = false) ObjectMapper objectMapper
    ) {
        this.aiProperties = aiProperties;
        this.objectMapper = (objectMapper != null ? objectMapper.copy() : new ObjectMapper())
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeoutMs = Math.max(5000, aiProperties.getTimeoutSeconds() * 1000);
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl(aiProperties.getBaseUrl())
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Override
    public String getProviderName() {
        return PROVIDER_NAME;
    }

    @Override
    public boolean isAvailable() {
        return aiProperties.isEnabled() &&
                aiProperties.getApiKey() != null &&
                !aiProperties.getApiKey().isBlank();
    }

    @Override
    public AICompletionResponse complete(AICompletionRequest request) {
        if (!aiProperties.isEnabled()) {
            throw new AIServiceException("AI Assistant is currently disabled in configuration.", "AI_DISABLED", false);
        }

        String apiKey = aiProperties.getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new AIServiceException(
                    "OpenAI API key is not configured. Set the AI_API_KEY environment variable.",
                    "MISSING_API_KEY",
                    false
            );
        }

        String targetModel = request.getModel() != null && !request.getModel().isBlank()
                ? request.getModel().trim()
                : aiProperties.getModel();

        OpenAIChatRequest payload = buildOpenAIPayload(request, targetModel);

        try {
            OpenAIChatResponse response = restClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey.trim())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, resp) -> {
                        int code = resp.getStatusCode().value();
                        String body = new String(resp.getBody().readAllBytes());
                        log.warn("OpenAI client error HTTP {}: {}", code, body);
                        if (code == 401) {
                            throw new AIServiceException("OpenAI authentication failed: Invalid or expired API key.", "AUTH_FAILED", false);
                        } else if (code == 429) {
                            throw new AIServiceException("OpenAI rate limit or monthly quota exceeded. Please retry later.", "RATE_LIMITED", true);
                        } else {
                            throw new AIServiceException("OpenAI rejected request (HTTP " + code + "): " + body, "CLIENT_ERROR", false);
                        }
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, resp) -> {
                        int code = resp.getStatusCode().value();
                        String body = new String(resp.getBody().readAllBytes());
                        log.error("OpenAI server error HTTP {}: {}", code, body);
                        throw new AIServiceException("OpenAI provider server error (HTTP " + code + "). Please try again.", "PROVIDER_OUTAGE", true);
                    })
                    .body(OpenAIChatResponse.class);

            if (response == null || response.choices == null || response.choices.isEmpty()) {
                throw new AIServiceException("Empty or malformed completion response received from OpenAI.", "EMPTY_RESPONSE", true);
            }

            return mapToAICompletionResponse(response, targetModel);

        } catch (AIServiceException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to execute OpenAI chat completion", e);
            throw new AIServiceException("Unable to contact OpenAI API: " + e.getMessage(), "CONNECTION_FAILURE", true, e);
        }
    }

    private OpenAIChatRequest buildOpenAIPayload(AICompletionRequest request, String model) {
        OpenAIChatRequest payload = new OpenAIChatRequest();
        payload.model = model;
        payload.temperature = request.getTemperature() != null ? request.getTemperature() : 0.2;
        payload.maxTokens = request.getMaxTokens() != null ? request.getMaxTokens() : aiProperties.getMaxOutputTokens();

        List<OpenAIMessage> msgs = new ArrayList<>();
        for (AIChatMessage msg : request.getMessages()) {
            OpenAIMessage m = new OpenAIMessage();
            m.role = msg.getRole().toApiValue();
            m.content = msg.getContent();

            if (msg.getRole() == AIChatRole.TOOL) {
                m.toolCallId = msg.getToolCallId();
            } else if (msg.getRole() == AIChatRole.ASSISTANT && msg.hasToolCalls()) {
                List<OpenAIToolCall> tcs = new ArrayList<>();
                for (AIToolCall tc : msg.getToolCalls()) {
                    OpenAIToolCall call = new OpenAIToolCall();
                    call.id = tc.id();
                    call.type = "function";
                    call.function = new OpenAIFunctionCall();
                    call.function.name = tc.name();
                    call.function.arguments = tc.argumentsJson();
                    tcs.add(call);
                }
                m.toolCalls = tcs;
            }
            msgs.add(m);
        }
        payload.messages = msgs;

        if (request.hasTools()) {
            List<OpenAIToolDefinition> toolDefs = new ArrayList<>();
            for (AIToolDefinition def : request.getTools()) {
                OpenAIToolDefinition td = new OpenAIToolDefinition();
                td.type = "function";
                td.function = new OpenAIFunctionDefinition();
                td.function.name = def.name();
                td.function.description = def.description();
                td.function.parameters = def.parametersSchema();
                toolDefs.add(td);
            }
            payload.tools = toolDefs;
        }

        return payload;
    }

    private AICompletionResponse mapToAICompletionResponse(OpenAIChatResponse resp, String model) {
        OpenAIChoice choice = resp.choices.get(0);
        OpenAIMessage choiceMsg = choice.message;

        AIChatMessage aiMsg;
        if (choiceMsg.toolCalls != null && !choiceMsg.toolCalls.isEmpty()) {
            List<AIToolCall> calls = new ArrayList<>();
            for (OpenAIToolCall tc : choiceMsg.toolCalls) {
                String args = tc.function != null ? tc.function.arguments : "{}";
                calls.add(new AIToolCall(tc.id, tc.function != null ? tc.function.name : "", args));
            }
            aiMsg = AIChatMessage.assistantToolCalls(calls);
            aiMsg.setContent(choiceMsg.content);
        } else {
            aiMsg = AIChatMessage.assistant(choiceMsg.content != null ? choiceMsg.content : "");
        }

        long tokensIn = resp.usage != null ? resp.usage.promptTokens : 0L;
        long tokensOut = resp.usage != null ? resp.usage.completionTokens : 0L;

        return new AICompletionResponse(
                aiMsg,
                choice.finishReason != null ? choice.finishReason : "stop",
                tokensIn,
                tokensOut,
                model,
                PROVIDER_NAME
        );
    }

    // ==========================================
    // Internal OpenAI wire format DTOs
    // ==========================================

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIChatRequest {
        public String model;
        public List<OpenAIMessage> messages;
        public Double temperature;
        @JsonProperty("max_tokens")
        public Integer maxTokens;
        public List<OpenAIToolDefinition> tools;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIMessage {
        public String role;
        public String content;
        @JsonProperty("tool_call_id")
        public String toolCallId;
        @JsonProperty("tool_calls")
        public List<OpenAIToolCall> toolCalls;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIToolDefinition {
        public String type = "function";
        public OpenAIFunctionDefinition function;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIFunctionDefinition {
        public String name;
        public String description;
        public Map<String, Object> parameters;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIToolCall {
        public String id;
        public String type = "function";
        public OpenAIFunctionCall function;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIFunctionCall {
        public String name;
        public String arguments;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIChatResponse {
        public String id;
        public List<OpenAIChoice> choices;
        public OpenAIUsage usage;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIChoice {
        public int index;
        public OpenAIMessage message;
        @JsonProperty("finish_reason")
        public String finishReason;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OpenAIUsage {
        @JsonProperty("prompt_tokens")
        public long promptTokens;
        @JsonProperty("completion_tokens")
        public long completionTokens;
        @JsonProperty("total_tokens")
        public long totalTokens;
    }
}
