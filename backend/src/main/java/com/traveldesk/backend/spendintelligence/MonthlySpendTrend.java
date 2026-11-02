package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record MonthlySpendTrend(
        String monthKey,    // e.g. "2024-04"
        String monthLabel,  // e.g. "Apr 2024"
        BigDecimal totalSpend,
        long tripCount,
        long travelerCount
) {}
