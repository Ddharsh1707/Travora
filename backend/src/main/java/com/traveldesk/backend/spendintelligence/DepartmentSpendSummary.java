package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;

public record DepartmentSpendSummary(
        String department,
        BigDecimal totalSpend,
        long employeeCount,
        long tripCount,
        BigDecimal avgSpendPerEmployee,
        double shareOfTotalSpend
) {}
