package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;

public record EmployeeSpendSummary(
        String employeeIdentifier,
        String employeeName,
        String department,
        long tripCount,
        BigDecimal totalSpend,
        BigDecimal avgSpendPerTrip,
        LocalDate firstTripDate,
        LocalDate lastTripDate,
        String topDestination,
        long domesticTrips,
        long internationalTrips
) {}

