package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ExecutiveSpendOverview(
        BigDecimal totalSpend,           // Net spend (kept for backwards compatibility)
        BigDecimal grossSpend,           // Gross billed spend before credit note reversals
        BigDecimal creditNotesSpend,     // Total value of credit note reversals / refunds
        BigDecimal netSpend,             // Net corporate spend (Gross - Credits)
        long totalTrips,
        long travelerCount,
        BigDecimal avgSpendPerTrip,      // Excludes zero-fare transit legs
        BigDecimal avgSpendPerTraveler,
        long creditNotesCount,
        long zeroFareTransitCount,
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
            BigDecimal grossSpend,
            BigDecimal creditNotesSpend,
            BigDecimal netSpend,
            long tripCount
    ) {}

    public record TopDepartment(
            String department,
            BigDecimal totalSpend,
            BigDecimal grossSpend,
            BigDecimal creditNotesSpend,
            BigDecimal netSpend,
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
