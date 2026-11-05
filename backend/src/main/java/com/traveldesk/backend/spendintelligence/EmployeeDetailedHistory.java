package com.traveldesk.backend.spendintelligence;

import com.traveldesk.backend.importdata.ImportedRecordResponse;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record EmployeeDetailedHistory(
        String employeeIdentifier,
        String employeeName,
        String department,
        BigDecimal lifetimeSpend,
        long lifetimeTrips,
        BigDecimal averageTripCost,
        LocalDate firstTripDate,
        LocalDate lastTripDate,
        String topDestination,
        List<ImportedRecordResponse> trips,
        List<MonthlySpendTrend> monthlyTrend
) {}

