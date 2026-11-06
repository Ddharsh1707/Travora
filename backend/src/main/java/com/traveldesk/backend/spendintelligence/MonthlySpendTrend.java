package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record MonthlySpendTrend(
        String monthKey,             // e.g. "2024-04"
        String monthLabel,           // e.g. "Apr 2024"
        BigDecimal totalSpend,       // Net spend (backwards compatibility)
        BigDecimal grossSpend,       // Gross billed spend
        BigDecimal creditNotesSpend, // Credit reversals
        BigDecimal netSpend,         // Net spend
        long tripCount,
        long travelerCount
) {}
