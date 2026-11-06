package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;

public record EmployeeSpendSummary(
        String employeeIdentifier,
        String employeeName,
        String department,
        long tripCount,
        BigDecimal totalSpend,       // Net spend (backwards compatibility)
        BigDecimal grossSpend,       // Gross billed spend
        BigDecimal creditNotesSpend, // Credits / refunds
        BigDecimal netSpend,         // Net spend (Gross - Credits)
        BigDecimal avgSpendPerTrip,  // Excludes zero-fare transit legs
        LocalDate firstTripDate,
        LocalDate lastTripDate,
        String topDestination,
        long domesticTrips,
        long internationalTrips,
        String verificationStatus    // VERIFIED, IMPORTED_UNVERIFIED
) {}
