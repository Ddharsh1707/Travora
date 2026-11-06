package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record FinancialYearSpend(
        String financialYear,        // e.g. "FY 2024-25"
        BigDecimal totalSpend,       // Net spend (backwards compatibility)
        BigDecimal grossSpend,       // Gross billed spend
        BigDecimal creditNotesSpend, // Credit reversals
        BigDecimal netSpend,         // Net spend
        long tripCount,
        long travelerCount
) {}
