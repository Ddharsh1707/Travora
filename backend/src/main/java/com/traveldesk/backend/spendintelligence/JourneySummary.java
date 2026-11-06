package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record JourneySummary(
        Long id,
        String journeyUid,
        String primaryPnr,
        String passengerName,
        String employeeIdentifier,
        String journeyType,
        String origin,
        String destination,
        LocalDate startDate,
        LocalDate endDate,
        int totalLegs,
        BigDecimal grossSpend,
        BigDecimal totalRefunds,
        BigDecimal netSpend,
        List<JourneyLegSummary> legs
) {
    public record JourneyLegSummary(
            Long recordId,
            int sequence,
            String origin,
            String destination,
            LocalDate travelDate,
            String carrier,
            String ticketReference,
            BigDecimal cost,
            boolean isZeroFareTransit
    ) {}
}

