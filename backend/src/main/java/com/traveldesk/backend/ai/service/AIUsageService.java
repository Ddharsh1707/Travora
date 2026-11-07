package com.traveldesk.backend.ai.service;

import com.traveldesk.backend.ai.config.AIProperties;
import com.traveldesk.backend.ai.entity.AIUsageRecord;
import com.traveldesk.backend.ai.exception.AIServiceException;
import com.traveldesk.backend.ai.repository.AIUsageRecordRepository;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class AIUsageService {

    private static final Logger log = LoggerFactory.getLogger(AIUsageService.class);

    private final AIUsageRecordRepository usageRepository;
    private final AIProperties properties;

    public AIUsageService(AIUsageRecordRepository usageRepository, AIProperties properties) {
        this.usageRepository = usageRepository;
        this.properties = properties;
    }

    /**
     * Enforce rate limits and monthly cost budgets prior to LLM execution.
     */
    @Transactional(readOnly = true)
    public void validateUsageQuota(Company company, User user) {
        if (!properties.isEnabled()) {
            throw new AIServiceException("Trapple AI Assistant is currently disabled.", "AI_DISABLED", false);
        }

        // 1. Per-user request rate limit (last 24 hours)
        LocalDateTime dayAgo = LocalDateTime.now().minusHours(24);
        long userRequests24h = usageRepository.countByCompanyIdAndUserIdAndCreatedAtAfter(company.getId(), user.getId(), dayAgo);
        if (userRequests24h >= properties.getMaxRequestsPerUser()) {
            throw new AIServiceException(
                    "You have reached your daily AI request limit (" + properties.getMaxRequestsPerUser() + " queries). Please try again tomorrow.",
                    "USER_QUOTA_EXCEEDED",
                    false
            );
        }

        // 2. Company-wide monthly budget ceiling
        LocalDateTime firstOfMonth = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        BigDecimal currentMonthCost = usageRepository.sumEstimatedCostByCompanyIdAndCreatedAtAfter(company.getId(), firstOfMonth);
        if (currentMonthCost != null && properties.getMonthlyBudget() != null &&
                currentMonthCost.compareTo(properties.getMonthlyBudget()) >= 0) {
            log.warn("Company {} reached monthly AI budget limit of ${} (spent: ${})",
                    company.getId(), properties.getMonthlyBudget(), currentMonthCost);
            throw new AIServiceException(
                    "Your organization has reached its monthly AI budget limit. Please contact your company administrator.",
                    "COMPANY_BUDGET_EXCEEDED",
                    false
            );
        }
    }

    /**
     * Record tokens and cost estimation for auditing and billing.
     */
    @Transactional
    public AIUsageRecord recordUsage(
            Company company,
            User user,
            Long conversationId,
            String provider,
            String model,
            long tokensIn,
            long tokensOut
    ) {
        BigDecimal cost = calculateEstimatedCost(model, tokensIn, tokensOut);
        AIUsageRecord record = new AIUsageRecord(
                company,
                user,
                conversationId,
                provider,
                model,
                tokensIn,
                tokensOut,
                cost
        );
        return usageRepository.save(record);
    }

    private BigDecimal calculateEstimatedCost(String model, long tokensIn, long tokensOut) {
        // Standard GPT-4o pricing tier: $2.50 per 1M input tokens, $10.00 per 1M output tokens
        BigDecimal inRatePerMillion = new BigDecimal("2.50");
        BigDecimal outRatePerMillion = new BigDecimal("10.00");

        if (model != null && model.toLowerCase().contains("mini")) {
            inRatePerMillion = new BigDecimal("0.15");
            outRatePerMillion = new BigDecimal("0.60");
        }

        BigDecimal oneMillion = new BigDecimal("1000000");
        BigDecimal inCost = BigDecimal.valueOf(tokensIn).multiply(inRatePerMillion).divide(oneMillion, 6, RoundingMode.HALF_UP);
        BigDecimal outCost = BigDecimal.valueOf(tokensOut).multiply(outRatePerMillion).divide(oneMillion, 6, RoundingMode.HALF_UP);

        return inCost.add(outCost).setScale(4, RoundingMode.HALF_UP);
    }
}
