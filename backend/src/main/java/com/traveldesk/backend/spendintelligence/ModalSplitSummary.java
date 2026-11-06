package com.traveldesk.backend.spendintelligence;

import java.math.BigDecimal;
import java.util.List;

public record ModalSplitSummary(
        BigDecimal totalGrossSpend,
        BigDecimal totalCreditNotes,
        BigDecimal totalNetSpend,
        List<CategorySplitItem> categories
) {
    public record CategorySplitItem(
            String category,
            String displayName,
            BigDecimal grossSpend,
            BigDecimal creditNotes,
            BigDecimal netSpend,
            double sharePct,
            long unitCount,
            BigDecimal avgUnitCost
    ) {}
}

