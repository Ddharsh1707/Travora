package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ExecutiveSpendOverview(
        BigDecimal totalSpend,
        long totalTrips,
        long travelerCount,
        BigDecimal avgSpendPerTrip,
        BigDecimal avgSpendPerTraveler,
        TopSpender highestSpendingEmployee,
        TopDepartment highestSpendingDepartment,
        List<FinancialYearSpend> spendByFinancialYear,
        List<MonthlySpendTrend> monthOnMonthSpend,
        DataTraceability dataTraceability
) {
    public record TopSpender(
            String employeeIdentifier,
            String employeeName,
            String department,
            BigDecimal totalSpend,
            long tripCount
    ) {}

    public record TopDepartment(
            String department,
            BigDecimal totalSpend,
            long tripCount,
            long travelerCount
    ) {}

    public record DataTraceability(
            long totalRecordsEvaluated,
            long recordsWithCost,
            long recordsWithoutCost,
            LocalDate dateRangeStart,
            LocalDate dateRangeEnd,
            String currency
    ) {}
}

