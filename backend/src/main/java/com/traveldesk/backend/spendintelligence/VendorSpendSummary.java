package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.util.List;

public record VendorSpendSummary(
        String provider,
        BigDecimal totalSpend,
        long bookingCount,
        BigDecimal avgBookingValue,
        List<String> travelModes,
        double shareOfSpend
) {}

