package com.traveldesk.backend.ai.service;

import com.traveldesk.backend.ai.config.AIProperties;
import com.traveldesk.backend.ai.provider.AIProvider;
import com.traveldesk.backend.ai.provider.AIProviderFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class AIHealthService {

    private final AIProperties properties;
    private final AIProviderFactory providerFactory;

    public AIHealthService(AIProperties properties, AIProviderFactory providerFactory) {
        this.properties = properties;
        this.providerFactory = providerFactory;
    }

    public Map<String, Object> getHealthStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("enabled", properties.isEnabled());
        status.put("provider", properties.getProvider());
        status.put("model", properties.getModel());

        try {
            AIProvider activeProvider = providerFactory.getActiveProvider();
            status.put("activeProvider", activeProvider.getProviderName());
            status.put("available", activeProvider.isAvailable());
            status.put("status", activeProvider.isAvailable() ? "READY" : "CONFIG_REQUIRED");
        } catch (Exception e) {
            status.put("available", false);
            status.put("status", "ERROR");
            status.put("error", e.getMessage());
        }

        return status;
    }
}

