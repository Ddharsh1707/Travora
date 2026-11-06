package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record DepartmentSpendSummary(
        String department,
        BigDecimal totalSpend,       // Net spend (backwards compatibility)
        BigDecimal grossSpend,       // Gross billed spend
        BigDecimal creditNotesSpend, // Credit note reversals
        BigDecimal netSpend,         // Net spend
        long employeeCount,
        long tripCount,
        BigDecimal avgSpendPerEmployee,
        double shareOfTotalSpend
) {}
