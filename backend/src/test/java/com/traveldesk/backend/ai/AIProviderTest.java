package com.traveldesk.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.config.AIProperties;
import com.traveldesk.backend.ai.dto.*;
import com.traveldesk.backend.ai.exception.AIServiceException;
import com.traveldesk.backend.ai.provider.AIProvider;
import com.traveldesk.backend.ai.provider.AIProviderFactory;
import com.traveldesk.backend.ai.provider.MockAIProvider;
import com.traveldesk.backend.ai.provider.OpenAIProvider;
import com.traveldesk.backend.ai.service.AIHealthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AIProviderTest {

    private AIProperties properties;
    private ObjectMapper objectMapper;
    private MockAIProvider mockProvider;
    private OpenAIProvider openAIProvider;
    private AIProviderFactory factory;
    private AIHealthService healthService;

    @BeforeEach
    void setUp() {
        properties = new AIProperties();
        properties.setProvider("mock");
        properties.setModel("gpt-4o");
        properties.setApiKey("");
        properties.setEnabled(true);

        objectMapper = new ObjectMapper();
        mockProvider = new MockAIProvider();
        openAIProvider = new OpenAIProvider(properties, objectMapper);

        factory = new AIProviderFactory(properties, List.of(mockProvider, openAIProvider));
        healthService = new AIHealthService(properties, factory);
    }

    @Test
    @DisplayName("AIProviderFactory selects active mock provider based on configuration")
    void testFactorySelection() {
        AIProvider provider = factory.getActiveProvider();
        assertNotNull(provider);
        assertEquals(MockAIProvider.PROVIDER_NAME, provider.getProviderName());
        assertTrue(provider.isAvailable());
    }

    @Test
    @DisplayName("MockAIProvider returns expected text answer")
    void testMockProviderCompletion() {
        AICompletionRequest request = new AICompletionRequest(
                List.of(AIChatMessage.user("Hello Trapple AI"))
        );

        AICompletionResponse response = mockProvider.complete(request);
        assertNotNull(response);
        assertEquals("stop", response.getFinishReason());
        assertNotNull(response.getContent());
        assertTrue(response.getContent().contains("Hello Trapple AI"));
        assertFalse(response.isToolCall());
    }

    @Test
    @DisplayName("MockAIProvider generates tool call when requested for travel spend")
    void testMockProviderToolCall() {
        AIToolDefinition toolDef = new AIToolDefinition(
                "getExecutiveSpendOverview",
                "Retrieves company spend metrics",
                Map.of("type", "object")
        );

        AICompletionRequest request = new AICompletionRequest(
                List.of(AIChatMessage.user("What is the total spend in October?")),
                List.of(toolDef)
        );

        AICompletionResponse response = mockProvider.complete(request);
        assertNotNull(response);
        assertTrue(response.isToolCall());
        assertEquals("tool_calls", response.getFinishReason());
        assertEquals(1, response.getToolCalls().size());
        assertEquals("get_executive_spend_overview", response.getToolCalls().get(0).name());
    }

    @Test
    @DisplayName("OpenAIProvider throws actionable AIServiceException when API key is missing")
    void testOpenAIProviderMissingApiKey() {
        properties.setApiKey("");
        assertFalse(openAIProvider.isAvailable());

        AICompletionRequest request = new AICompletionRequest(
                List.of(AIChatMessage.user("Test"))
        );

        AIServiceException ex = assertThrows(AIServiceException.class, () -> openAIProvider.complete(request));
        assertEquals("MISSING_API_KEY", ex.getErrorCode());
        assertTrue(ex.getMessage().contains("AI_API_KEY"));
    }

    @Test
    @DisplayName("AIHealthService reports health status cleanly without leaking secrets")
    void testHealthService() {
        Map<String, Object> health = healthService.getHealthStatus();
        assertNotNull(health);
        assertEquals(true, health.get("enabled"));
        assertEquals("mock", health.get("provider"));
        assertEquals("gpt-4o", health.get("model"));
        assertEquals("READY", health.get("status"));
        assertNull(health.get("apiKey"));
    }

    @Test
    @DisplayName("Unsupported provider throws clear exception")
    void testUnsupportedProvider() {
        properties.setProvider("nonexistent-provider");
        AIServiceException ex = assertThrows(AIServiceException.class, () -> factory.getActiveProvider());
        assertEquals("UNSUPPORTED_PROVIDER", ex.getErrorCode());
    }
}

