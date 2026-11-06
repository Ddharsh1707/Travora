package com.traveldesk.backend.spendintelligence;

import java.util.Collections;
import java.util.List;

public record CombinedSpendIntelligence(
        ExecutiveSpendOverview overview,
        List<EmployeeSpendSummary> employees,
        List<DepartmentSpendSummary> departments,
        DestinationAnalysis destinations,
        List<VendorSpendSummary> vendors,
        List<ProjectSpendSummary> projects,
        ModalSplitSummary modalSplit,
        List<CreditNoteSummary> creditNotes
) {
    public CombinedSpendIntelligence(
            ExecutiveSpendOverview overview,
            List<EmployeeSpendSummary> employees,
            List<DepartmentSpendSummary> departments,
            DestinationAnalysis destinations,
            List<VendorSpendSummary> vendors
    ) {
        this(overview, employees, departments, destinations, vendors, Collections.emptyList(), null, Collections.emptyList());
    }
}
