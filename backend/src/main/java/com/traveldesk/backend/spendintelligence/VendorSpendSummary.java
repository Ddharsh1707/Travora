package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.util.List;

public record VendorSpendSummary(
        String provider,
        BigDecimal totalSpend,       // Net spend (backwards compatibility)
        BigDecimal grossSpend,       // Gross billed spend
        BigDecimal creditNotesSpend, // Credit note reversals
        BigDecimal netSpend,         // Net spend
        long bookingCount,
        BigDecimal avgBookingValue,
        List<String> travelModes,
        double shareOfSpend
) {}
