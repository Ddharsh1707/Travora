package com.traveldesk.backend.spendintelligence;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/reports/spend")
public class TravelSpendController {

    private final TravelSpendService spendService;
    private final UserRepository userRepository;

    public TravelSpendController(TravelSpendService spendService, UserRepository userRepository) {
        this.spendService = spendService;
        this.userRepository = userRepository;
    }

    private User getAuthenticatedUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User is not authenticated");
        }
        return userRepository.findByUsername(auth.getName()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User account not found")
        );
    }

    private LocalDate parseSafeDate(String dateStr) {
        if (dateStr == null || dateStr.isBlank()) return null;
        try {
            return LocalDate.parse(dateStr.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private SpendFilter buildFilter(
            String search,
            String department,
            String employeeId,
            String provider,
            String travelMode,
            String financialYear,
            String period,
            String fromDate,
            String toDate
    ) {
        return new SpendFilter(search, department, employeeId, provider, travelMode, financialYear, period, parseSafeDate(fromDate), parseSafeDate(toDate));
    }

    @GetMapping("/combined")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<CombinedSpendIntelligence> getCombinedIntelligence(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getCombinedIntelligence(user, filter));
    }

    @GetMapping("/overview")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<ExecutiveSpendOverview> getExecutiveOverview(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getExecutiveOverview(user, filter));
    }

    @GetMapping("/employees")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<EmployeeSpendSummary>> getEmployeeAnalysis(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getEmployeeSpendAnalysis(user, filter));
    }

    @GetMapping("/employee/{identifier}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<EmployeeDetailedHistory> getEmployeeDetailedHistory(@PathVariable String identifier) {
        User user = getAuthenticatedUser();
        try {
            return ResponseEntity.ok(spendService.getEmployeeDetailedHistory(user, identifier));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    @GetMapping("/departments")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<DepartmentSpendSummary>> getDepartmentAnalysis(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getDepartmentSpendAnalysis(user, filter));
    }

    @GetMapping("/destinations")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<DestinationAnalysis> getDestinationAnalysis(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getDestinationAnalysis(user, filter));
    }

    @GetMapping("/vendors")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<VendorSpendSummary>> getVendorAnalysis(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        return ResponseEntity.ok(spendService.getVendorAnalysis(user, filter));
    }

    @GetMapping("/filters/departments")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<String>> getFilterDepartments() {
        User user = getAuthenticatedUser();
        return ResponseEntity.ok(spendService.getFilterDepartments(user));
    }

    @GetMapping("/filters/providers")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<String>> getFilterProviders() {
        User user = getAuthenticatedUser();
        return ResponseEntity.ok(spendService.getFilterProviders(user));
    }

    @GetMapping("/export")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<byte[]> exportSpendReport(
            @RequestParam(defaultValue = "EXECUTIVE_SUMMARY") String type,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String provider,
            @RequestParam(required = false) String travelMode,
            @RequestParam(required = false) String financialYear,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate
    ) {
        User user = getAuthenticatedUser();
        SpendFilter filter = buildFilter(search, department, employeeId, provider, travelMode, financialYear, period, fromDate, toDate);
        String csv = spendService.exportSpendReportCsv(user, filter, type);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);

        String filename = "spend_report_" + type.toLowerCase() + "_" + LocalDate.now() + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }
}
