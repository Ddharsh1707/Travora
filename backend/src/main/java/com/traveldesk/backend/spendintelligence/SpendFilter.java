package com.traveldesk.backend.spendintelligence;

import java.time.LocalDate;

public record SpendFilter(
        String search,
        String department,
        String employeeId,
        String provider,
        String travelMode,
        String financialYear,
        String period,
        LocalDate fromDate,
        LocalDate toDate
) {
    public SpendFilter {
        if (search != null) search = search.trim();
        if (department != null) department = department.trim();
        if (employeeId != null) employeeId = employeeId.trim();
        if (provider != null) provider = provider.trim();
        if (travelMode != null) travelMode = travelMode.trim();
        if (financialYear != null) financialYear = financialYear.trim();
        if (period != null) period = period.trim();
    }
}
