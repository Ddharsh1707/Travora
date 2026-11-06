package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record ProjectSpendSummary(
        Long projectId,
        String projectCode,
        String projectName,
        String clientName,
        String location,
        BigDecimal budgetAmount,
        String status,
        BigDecimal grossSpend,
        BigDecimal creditNotesSpend,
        BigDecimal netSpend,
        long tripCount,
        long distinctTravelers,
        Double budgetUtilizationPct,
        String topRoute
) {}

