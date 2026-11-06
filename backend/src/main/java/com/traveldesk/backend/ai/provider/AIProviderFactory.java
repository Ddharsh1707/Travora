package com.traveldesk.backend.ai.provider;

import com.traveldesk.backend.ai.config.AIProperties;
import com.traveldesk.backend.ai.exception.AIServiceException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class AIProviderFactory {

    private final AIProperties aiProperties;
    private final Map<String, AIProvider> providers;

    public AIProviderFactory(AIProperties aiProperties, List<AIProvider> providerList) {
        this.aiProperties = aiProperties;
        this.providers = providerList.stream()
                .collect(Collectors.toMap(
                        p -> p.getProviderName().toLowerCase(),
                        p -> p,
                        (existing, replacement) -> existing
                ));
    }

    public AIProvider getActiveProvider() {
        String target = aiProperties.getProvider() != null ? aiProperties.getProvider().trim().toLowerCase() : "openai";
        AIProvider provider = providers.get(target);

        if (provider == null) {
            throw new AIServiceException(
                    "Configured AI provider '" + target + "' is not supported. Available: " + providers.keySet(),
                    "UNSUPPORTED_PROVIDER",
                    false
            );
        }

        return provider;
    }

    public AIProvider getProvider(String providerName) {
        if (providerName == null || providerName.isBlank()) {
            return getActiveProvider();
        }
        AIProvider p = providers.get(providerName.trim().toLowerCase());
        if (p == null) {
            throw new AIServiceException("AI provider '" + providerName + "' not registered.", "PROVIDER_NOT_FOUND", false);
        }
        return p;
    }

    public boolean hasAvailableProvider() {
        try {
            return getActiveProvider().isAvailable();
        } catch (Exception e) {
            return false;
        }
    }

    public String getActiveModel() {
        return aiProperties.getModel() != null ? aiProperties.getModel() : "gpt-4o";
    }
}

