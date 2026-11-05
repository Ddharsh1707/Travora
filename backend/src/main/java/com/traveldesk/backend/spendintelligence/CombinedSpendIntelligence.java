package com.traveldesk.backend.spendintelligence;

import java.util.List;

public record CombinedSpendIntelligence(
        ExecutiveSpendOverview overview,
        List<EmployeeSpendSummary> employees,
        List<DepartmentSpendSummary> departments,
        DestinationAnalysis destinations,
        List<VendorSpendSummary> vendors
) {}

