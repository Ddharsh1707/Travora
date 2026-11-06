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
        LocalDate toDate,
        String projectName,
        String travelCategory,
        Boolean isCreditNote
) {
    public SpendFilter {
        if (search != null) search = search.trim();
        if (department != null) department = department.trim();
        if (employeeId != null) employeeId = employeeId.trim();
        if (provider != null) provider = provider.trim();
        if (travelMode != null) travelMode = travelMode.trim();
        if (financialYear != null) financialYear = financialYear.trim();
        if (period != null) period = period.trim();
        if (projectName != null) projectName = projectName.trim();
        if (travelCategory != null) travelCategory = travelCategory.trim();
    }

    public SpendFilter(
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
        this(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate, null, null, null);
    }
}
