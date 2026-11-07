package com.traveldesk.backend.ai.policy;

import com.traveldesk.backend.company.Company;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class PolicyDocumentService {

    public record PolicySection(
            String sectionNumber,
            String title,
            String category,
            String content,
            List<String> keywords
    ) {}

    private final List<PolicySection> defaultPolicySections = new ArrayList<>();

    public PolicyDocumentService() {
        initializeDefaultPolicies();
    }

    private void initializeDefaultPolicies() {
        defaultPolicySections.add(new PolicySection(
                "POL-SEC-101",
                "Flight Booking Guidelines & Class of Travel",
                "FLIGHTS",
                "1. All domestic travel must be booked in Economy Class.\n" +
                "2. Business class is permitted only for international long-haul flights exceeding 8 continuous hours with prior VP/Director sign-off.\n" +
                "3. Advance Booking Rule: Flights must be booked at least 7 calendar days prior to departure to minimize spot fare surcharges.\n" +
                "4. Preferred Airlines: Indigo, Air India, and Akasa Air via corporate portal with web check-in.",
                List.of("flight", "flights", "air", "airline", "economy", "business class", "advance booking", "booking window")
        ));

        defaultPolicySections.add(new PolicySection(
                "POL-SEC-102",
                "Hotel Accommodation Tiers & Rate Caps",
                "HOTEL",
                "1. Tier 1 Metro Cities (Mumbai, Delhi NCR, Bengaluru, Hyderabad, Chennai): Maximum ₹6,500 + taxes per night.\n" +
                "2. Tier 2 Cities (Pune, Ahmedabad, Kolkata, Kochi, Jaipur, Chandigarh): Maximum ₹4,500 + taxes per night.\n" +
                "3. Tier 3 and Project Site Locations: Maximum ₹3,000 + taxes per night.\n" +
                "4. Room bookings must include complimentary breakfast wherever available. Laundry is reimbursable for stays exceeding 3 consecutive nights.",
                List.of("hotel", "accommodation", "lodging", "stay", "room", "tier 1", "tier 2", "rate cap", "nightly limit")
        ));

        defaultPolicySections.add(new PolicySection(
                "POL-SEC-103",
                "Daily Per Diem, Meals & Incidental Allowances",
                "PER_DIEM",
                "1. Daily food and incidental allowance: ₹1,500 per day for Tier 1 cities; ₹1,000 per day for Tier 2/3 locations.\n" +
                "2. Individual meal bills exceeding ₹500 require GST-compliant itemized invoices.\n" +
                "3. Alcoholic beverages and personal mini-bar charges are strictly non-reimbursable.\n" +
                "4. Local intra-city travel: Pre-paid app-based cabs (Uber/Ola) or metro transit reimbursable with digital receipt.",
                List.of("per diem", "meal", "meals", "food", "dinner", "lunch", "breakfast", "daily allowance", "incidentals", "cabs", "taxi", "uber")
        ));

        defaultPolicySections.add(new PolicySection(
                "POL-SEC-104",
                "Cancellations, Refunds & Credit Note Ledger Rules",
                "CANCELLATION",
                "1. Decision 3 Financial Invariant: In the event of trip cancellation or flight rescheduling, the Travel Desk must record the credit note or refund in the ledger against the original ticket reference.\n" +
                "2. Net corporate spend is calculated as: Net Spend = Gross Spend - Credit Notes / Refunds.\n" +
                "3. Intermediate zero-fare layover legs (Decision 4) must be tagged as zero-fare transit to avoid double-counting expenditure.\n" +
                "4. Cancellation notices must be reported to the Travel Desk at least 24 hours prior to scheduled departure.",
                List.of("cancel", "cancellation", "refund", "credit note", "decision 3", "decision 4", "zero fare", "reschedule")
        ));

        defaultPolicySections.add(new PolicySection(
                "POL-SEC-105",
                "Expense Reimbursement Timeline & Approvals",
                "EXPENSES",
                "1. All travel expense claims must be submitted within 15 calendar days from the journey completion date.\n" +
                "2. Claims submitted after 30 days require exceptional approval from the Finance Controller.\n" +
                "3. Designated Approver must review and approve/reject claims within 5 business days.\n" +
                "4. Approved reimbursements are credited to employee payroll bank accounts in the subsequent bi-weekly pay cycle.",
                List.of("expense", "reimbursement", "deadline", "timeline", "claim", "submit", "approval", "payroll", "receipt")
        ));
    }

    /**
     * Searches company travel policy for matching sections based on user query keywords.
     */
    public List<PolicySection> searchPolicy(Company company, String query) {
        if (query == null || query.isBlank()) {
            return Collections.unmodifiableList(defaultPolicySections);
        }

        String q = query.trim().toLowerCase();
        List<PolicySection> matches = new ArrayList<>();

        for (PolicySection sec : defaultPolicySections) {
            boolean titleMatch = sec.title().toLowerCase().contains(q);
            boolean contentMatch = sec.content().toLowerCase().contains(q);
            boolean keywordMatch = sec.keywords().stream().anyMatch(k -> q.contains(k) || k.contains(q));

            if (titleMatch || contentMatch || keywordMatch) {
                matches.add(sec);
            }
        }

        return matches.isEmpty() ? defaultPolicySections : matches;
    }
}

