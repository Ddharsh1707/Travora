package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record FinancialYearSpend(
        String financialYear, // e.g. "FY 2024-25"
        BigDecimal totalSpend,
        long tripCount,
        long travelerCount
) {}

