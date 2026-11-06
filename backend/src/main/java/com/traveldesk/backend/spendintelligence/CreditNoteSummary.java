package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CreditNoteSummary(
        Long id,
        String ticketReference,
        String originalTicketReference,
        String passengerName,
        LocalDate travelDate,
        String provider,
        BigDecimal refundAmount,
        String projectName,
        String travelCategory,
        String reconciliationStatus // MATCHED_TO_ORIGINAL, UNMATCHED, PARTIALLY_MATCHED, MANUAL_REVIEW
) {}

