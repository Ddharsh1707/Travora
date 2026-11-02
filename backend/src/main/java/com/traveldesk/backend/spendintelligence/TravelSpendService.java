package com.traveldesk.backend.spendintelligence;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.importdata.ImportedRecordResponse;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.Month;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class TravelSpendService {

    private final ImportedTravelRecordRepository recordRepository;

    private static final DateTimeFormatter MONTH_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH_KEY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM", Locale.ENGLISH);

    // Common international airport/city indicators for Indian corporate travel
    private static final Set<String> INTERNATIONAL_INDICATORS = Set.of(
            "DUBAI", "DXB", "SINGAPORE", "SIN", "LONDON", "LHR", "LGW", "NEW YORK", "JFK",
            "DOHA", "DOH", "ABU DHABI", "AUH", "BANGKOK", "BKK", "KUALA LUMPUR", "KUL",
            "FRANKFURT", "FRA", "PARIS", "CDG", "TOKYO", "NRT", "HND", "HONG KONG", "HKG",
            "COLOMBO", "CMB", "DHAKA", "DAC", "KATHMANDU", "KTM", "MUSCAT", "MCT",
            "BAHRAIN", "BAH", "KUWAIT", "KWI", "RIYADH", "RUH", "JEDDAH", "JED",
            "SYDNEY", "SYD", "MELBOURNE", "MEL", "TORONTO", "YYZ", "CHICAGO", "ORD",
            "SAN FRANCISCO", "SFO", "DALLAS", "DFW", "AMSTERDAM", "AMS", "ZURICH", "ZRH"
    );

    public TravelSpendService(ImportedTravelRecordRepository recordRepository) {
        this.recordRepository = recordRepository;
    }

    private Company getRequiredCompany(User currentUser) {
        if (currentUser == null || currentUser.getCompany() == null) {
            throw new IllegalArgumentException("User account is not associated with an active company tenant.");
        }
        return currentUser.getCompany();
    }

    /**
     * Resolve effective from and to dates based on filter period / financial year.
     */
    public record ResolvedDates(LocalDate fromDate, LocalDate toDate) {}

    public ResolvedDates resolveDates(SpendFilter filter) {
        LocalDate today = LocalDate.now();
        LocalDate fromDate = filter.fromDate();
        LocalDate toDate = filter.toDate();

        if (filter.period() != null && !filter.period().isBlank()) {
            String p = filter.period().toUpperCase();
            switch (p) {
                case "CURRENT_MONTH" -> {
                    fromDate = today.withDayOfMonth(1);
                    toDate = today;
                }
                case "PREVIOUS_MONTH" -> {
                    LocalDate firstOfLastMonth = today.minusMonths(1).withDayOfMonth(1);
                    fromDate = firstOfLastMonth;
                    toDate = firstOfLastMonth.plusMonths(1).minusDays(1);
                }
                case "CURRENT_QUARTER" -> {
                    int currentMonth = today.getMonthValue();
                    int quarterStartMonth = ((currentMonth - 1) / 3) * 3 + 1;
                    fromDate = LocalDate.of(today.getYear(), quarterStartMonth, 1);
                    toDate = today;
                }
                case "PREVIOUS_QUARTER" -> {
                    int currentMonth = today.getMonthValue();
                    int quarterStartMonth = ((currentMonth - 1) / 3) * 3 + 1;
                    LocalDate currentQuarterStart = LocalDate.of(today.getYear(), quarterStartMonth, 1);
                    fromDate = currentQuarterStart.minusMonths(3);
                    toDate = currentQuarterStart.minusDays(1);
                }
                case "CURRENT_FY" -> {
                    int fyStartYear = today.getMonthValue() >= 4 ? today.getYear() : today.getYear() - 1;
                    fromDate = LocalDate.of(fyStartYear, 4, 1);
                    toDate = LocalDate.of(fyStartYear + 1, 3, 31);
                }
                case "PREVIOUS_FY" -> {
                    int fyStartYear = (today.getMonthValue() >= 4 ? today.getYear() : today.getYear() - 1) - 1;
                    fromDate = LocalDate.of(fyStartYear, 4, 1);
                    toDate = LocalDate.of(fyStartYear + 1, 3, 31);
                }
                default -> {}
            }
        } else if (filter.financialYear() != null && !filter.financialYear().isBlank()) {
            String fy = filter.financialYear().replaceAll("[^0-9-]", "");
            try {
                if (fy.contains("-")) {
                    String[] parts = fy.split("-");
                    int startYear = Integer.parseInt(parts[0].trim());
                    fromDate = LocalDate.of(startYear, 4, 1);
                    toDate = LocalDate.of(startYear + 1, 3, 31);
                } else if (fy.length() == 4) {
                    int startYear = Integer.parseInt(fy);
                    fromDate = LocalDate.of(startYear, 4, 1);
                    toDate = LocalDate.of(startYear + 1, 3, 31);
                }
            } catch (Exception ignored) {}
        }

        return new ResolvedDates(fromDate, toDate);
    }

    private List<ImportedTravelRecord> getFilteredRecords(User currentUser, SpendFilter filter) {
        Company company = getRequiredCompany(currentUser);
        ResolvedDates dates = resolveDates(filter);
        List<ImportedTravelRecord> allRecords = recordRepository.findByCompanyIdAndImported(company.getId(), true);

        return allRecords.stream()
                .filter(r -> {
                    // Employee ID filter
                    if (filter.employeeId() != null && !filter.employeeId().isBlank()) {
                        String filterEmp = filter.employeeId().trim();
                        boolean matchIdent = r.getRawEmployeeIdentifier() != null && r.getRawEmployeeIdentifier().equalsIgnoreCase(filterEmp);
                        boolean matchLinked = r.getEmployee() != null && r.getEmployee().getEmployeeId() != null && r.getEmployee().getEmployeeId().equalsIgnoreCase(filterEmp);
                        if (!matchIdent && !matchLinked) return false;
                    }

                    // Department filter
                    if (filter.department() != null && !filter.department().isBlank()) {
                        if (r.getDepartment() == null || !r.getDepartment().trim().equalsIgnoreCase(filter.department().trim())) {
                            return false;
                        }
                    }

                    // Provider / Carrier filter
                    if (filter.provider() != null && !filter.provider().isBlank()) {
                        if (r.getProvider() == null || !r.getProvider().trim().equalsIgnoreCase(filter.provider().trim())) {
                            return false;
                        }
                    }

                    // Travel mode filter
                    if (filter.travelMode() != null && !filter.travelMode().isBlank()) {
                        if (r.getTravelMode() == null || !r.getTravelMode().trim().equalsIgnoreCase(filter.travelMode().trim())) {
                            return false;
                        }
                    }

                    // Date range filter
                    if (dates.fromDate() != null) {
                        if (r.getTravelDate() == null || r.getTravelDate().isBefore(dates.fromDate())) {
                            return false;
                        }
                    }
                    if (dates.toDate() != null) {
                        if (r.getTravelDate() == null || r.getTravelDate().isAfter(dates.toDate())) {
                            return false;
                        }
                    }

                    // Text search filter
                    if (filter.search() != null && !filter.search().isBlank()) {
                        String s = filter.search().toLowerCase();
                        boolean matchesName = r.getRawEmployeeName() != null && r.getRawEmployeeName().toLowerCase().contains(s);
                        boolean matchesId = r.getRawEmployeeIdentifier() != null && r.getRawEmployeeIdentifier().toLowerCase().contains(s);
                        boolean matchesFrom = r.getFromLocation() != null && r.getFromLocation().toLowerCase().contains(s);
                        boolean matchesTo = r.getToLocation() != null && r.getToLocation().toLowerCase().contains(s);
                        boolean matchesDept = r.getDepartment() != null && r.getDepartment().toLowerCase().contains(s);
                        boolean matchesTicket = r.getTicketReference() != null && r.getTicketReference().toLowerCase().contains(s);
                        boolean matchesProject = r.getProjectName() != null && r.getProjectName().toLowerCase().contains(s);
                        if (!matchesName && !matchesId && !matchesFrom && !matchesTo && !matchesDept && !matchesTicket && !matchesProject) {
                            return false;
                        }
                    }

                    return true;
                })
                .sorted(Comparator.comparing(ImportedTravelRecord::getTravelDate, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(ImportedTravelRecord::getId, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    /**
     * Executive Overview: Core metrics, Month-on-Month trends, Financial Year distribution.
     */
    public ExecutiveSpendOverview getExecutiveOverview(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        ResolvedDates dates = resolveDates(filter);

        long totalRecordsEvaluated = records.size();
        long recordsWithCost = 0;
        BigDecimal totalSpend = BigDecimal.ZERO;
        Set<String> distinctTravelers = new HashSet<>();
        LocalDate earliestDate = null;
        LocalDate latestDate = null;

        Map<String, BigDecimal> employeeSpendMap = new HashMap<>();
        Map<String, String> employeeNameMap = new HashMap<>();
        Map<String, String> employeeDeptMap = new HashMap<>();
        Map<String, Long> employeeTripCountMap = new HashMap<>();

        Map<String, BigDecimal> deptSpendMap = new HashMap<>();
        Map<String, Long> deptTripCountMap = new HashMap<>();
        Map<String, Set<String>> deptTravelersMap = new HashMap<>();

        Map<String, BigDecimal> fySpendMap = new HashMap<>();
        Map<String, Long> fyTripCountMap = new HashMap<>();
        Map<String, Set<String>> fyTravelersMap = new HashMap<>();

        Map<String, BigDecimal> monthSpendMap = new TreeMap<>();
        Map<String, Long> monthTripCountMap = new HashMap<>();
        Map<String, Set<String>> monthTravelersMap = new HashMap<>();

        for (ImportedTravelRecord r : records) {
            String empId = r.getRawEmployeeIdentifier() != null && !r.getRawEmployeeIdentifier().isBlank()
                    ? r.getRawEmployeeIdentifier()
                    : (r.getRawEmployeeName() != null ? r.getRawEmployeeName() : "UNKNOWN");
            String empName = r.getRawEmployeeName() != null && !r.getRawEmployeeName().isBlank() ? r.getRawEmployeeName() : empId;
            String dept = r.getDepartment() != null && !r.getDepartment().isBlank() ? r.getDepartment() : "General";

            distinctTravelers.add(empId);

            if (r.getTravelDate() != null) {
                if (earliestDate == null || r.getTravelDate().isBefore(earliestDate)) {
                    earliestDate = r.getTravelDate();
                }
                if (latestDate == null || r.getTravelDate().isAfter(latestDate)) {
                    latestDate = r.getTravelDate();
                }

                // Financial Year: April 1 to March 31
                String fy = calculateFinancialYear(r.getTravelDate());
                fyTripCountMap.put(fy, fyTripCountMap.getOrDefault(fy, 0L) + 1);
                fyTravelersMap.computeIfAbsent(fy, k -> new HashSet<>()).add(empId);

                // Month Key
                String monthKey = r.getTravelDate().format(MONTH_KEY_FORMAT);
                monthTripCountMap.put(monthKey, monthTripCountMap.getOrDefault(monthKey, 0L) + 1);
                monthTravelersMap.computeIfAbsent(monthKey, k -> new HashSet<>()).add(empId);

                if (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) > 0) {
                    fySpendMap.put(fy, fySpendMap.getOrDefault(fy, BigDecimal.ZERO).add(r.getCost()));
                    monthSpendMap.put(monthKey, monthSpendMap.getOrDefault(monthKey, BigDecimal.ZERO).add(r.getCost()));
                }
            }

            // Employee stats
            employeeTripCountMap.put(empId, employeeTripCountMap.getOrDefault(empId, 0L) + 1);
            employeeNameMap.putIfAbsent(empId, empName);
            employeeDeptMap.putIfAbsent(empId, dept);

            // Dept stats
            deptTripCountMap.put(dept, deptTripCountMap.getOrDefault(dept, 0L) + 1);
            deptTravelersMap.computeIfAbsent(dept, k -> new HashSet<>()).add(empId);

            if (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) >= 0) {
                recordsWithCost++;
                totalSpend = totalSpend.add(r.getCost());
                employeeSpendMap.put(empId, employeeSpendMap.getOrDefault(empId, BigDecimal.ZERO).add(r.getCost()));
                deptSpendMap.put(dept, deptSpendMap.getOrDefault(dept, BigDecimal.ZERO).add(r.getCost()));
            }
        }

        long recordsWithoutCost = totalRecordsEvaluated - recordsWithCost;
        long travelerCount = distinctTravelers.size();

        BigDecimal avgSpendPerTrip = recordsWithCost > 0
                ? totalSpend.divide(BigDecimal.valueOf(recordsWithCost), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        BigDecimal avgSpendPerTraveler = travelerCount > 0
                ? totalSpend.divide(BigDecimal.valueOf(travelerCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // Top Spender
        ExecutiveSpendOverview.TopSpender topSpender = null;
        if (!employeeSpendMap.isEmpty()) {
            Map.Entry<String, BigDecimal> top = employeeSpendMap.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .orElse(null);
            if (top != null) {
                topSpender = new ExecutiveSpendOverview.TopSpender(
                        top.getKey(),
                        employeeNameMap.getOrDefault(top.getKey(), top.getKey()),
                        employeeDeptMap.getOrDefault(top.getKey(), "General"),
                        top.getValue(),
                        employeeTripCountMap.getOrDefault(top.getKey(), 0L)
                );
            }
        }

        // Top Department
        ExecutiveSpendOverview.TopDepartment topDept = null;
        if (!deptSpendMap.isEmpty()) {
            Map.Entry<String, BigDecimal> top = deptSpendMap.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .orElse(null);
            if (top != null) {
                topDept = new ExecutiveSpendOverview.TopDepartment(
                        top.getKey(),
                        top.getValue(),
                        deptTripCountMap.getOrDefault(top.getKey(), 0L),
                        deptTravelersMap.getOrDefault(top.getKey(), Collections.emptySet()).size()
                );
            }
        }

        // Spend by Financial Year sorted descending
        List<FinancialYearSpend> fyList = fyTripCountMap.keySet().stream()
                .sorted(Comparator.reverseOrder())
                .map(fy -> new FinancialYearSpend(
                        fy,
                        fySpendMap.getOrDefault(fy, BigDecimal.ZERO),
                        fyTripCountMap.getOrDefault(fy, 0L),
                        fyTravelersMap.getOrDefault(fy, Collections.emptySet()).size()
                ))
                .toList();

        // Month on Month Spend sorted chronologically
        List<MonthlySpendTrend> monthList = monthTripCountMap.keySet().stream()
                .sorted()
                .map(monthKey -> {
                    LocalDate sample = LocalDate.parse(monthKey + "-01");
                    return new MonthlySpendTrend(
                            monthKey,
                            sample.format(MONTH_LABEL_FORMAT),
                            monthSpendMap.getOrDefault(monthKey, BigDecimal.ZERO),
                            monthTripCountMap.getOrDefault(monthKey, 0L),
                            monthTravelersMap.getOrDefault(monthKey, Collections.emptySet()).size()
                    );
                })
                .toList();

        ExecutiveSpendOverview.DataTraceability traceability = new ExecutiveSpendOverview.DataTraceability(
                totalRecordsEvaluated,
                recordsWithCost,
                recordsWithoutCost,
                dates.fromDate() != null ? dates.fromDate() : earliestDate,
                dates.toDate() != null ? dates.toDate() : latestDate,
                "INR"
        );

        return new ExecutiveSpendOverview(
                totalSpend,
                totalRecordsEvaluated,
                travelerCount,
                avgSpendPerTrip,
                avgSpendPerTraveler,
                topSpender,
                topDept,
                fyList,
                monthList,
                traceability
        );
    }

    /**
     * Employee Travel Analysis: Aggregate breakdown per employee with lifetime metrics and top destination.
     */
    public List<EmployeeSpendSummary> getEmployeeSpendAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        Map<String, List<ImportedTravelRecord>> byEmployee = records.stream()
                .collect(Collectors.groupingBy(r -> r.getRawEmployeeIdentifier() != null && !r.getRawEmployeeIdentifier().isBlank()
                        ? r.getRawEmployeeIdentifier()
                        : (r.getRawEmployeeName() != null ? r.getRawEmployeeName() : "UNKNOWN")));

        List<EmployeeSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byEmployee.entrySet()) {
            String empId = entry.getKey();
            List<ImportedTravelRecord> empRecords = entry.getValue();

            String name = empRecords.stream()
                    .map(ImportedTravelRecord::getRawEmployeeName)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(empId);

            String dept = empRecords.stream()
                    .map(ImportedTravelRecord::getDepartment)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse("General");

            long tripCount = empRecords.size();
            BigDecimal totalSpend = empRecords.stream()
                    .map(ImportedTravelRecord::getCost)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            long costTrips = empRecords.stream().filter(r -> r.getCost() != null).count();
            BigDecimal avgSpend = costTrips > 0
                    ? totalSpend.divide(BigDecimal.valueOf(costTrips), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            LocalDate firstDate = empRecords.stream()
                    .map(ImportedTravelRecord::getTravelDate)
                    .filter(Objects::nonNull)
                    .min(LocalDate::compareTo)
                    .orElse(null);

            LocalDate lastDate = empRecords.stream()
                    .map(ImportedTravelRecord::getTravelDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo)
                    .orElse(null);

            // Top destination
            String topDest = empRecords.stream()
                    .map(ImportedTravelRecord::getToLocation)
                    .filter(Objects::nonNull)
                    .collect(Collectors.groupingBy(d -> d.trim().toUpperCase(), Collectors.counting()))
                    .entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse("—");

            // Domestic vs International
            long internationalCount = empRecords.stream()
                    .filter(this::isInternationalTrip)
                    .count();
            long domesticCount = tripCount - internationalCount;

            result.add(new EmployeeSpendSummary(
                    empId,
                    name,
                    dept,
                    tripCount,
                    totalSpend,
                    avgSpend,
                    firstDate,
                    lastDate,
                    topDest,
                    domesticCount,
                    internationalCount
            ));
        }

        // Sort by totalSpend descending
        result.sort(Comparator.comparing(EmployeeSpendSummary::totalSpend).reversed());
        return result;
    }

    /**
     * Department-wise Expenditure: spend, travelers, trips, and average per employee.
     */
    public List<DepartmentSpendSummary> getDepartmentSpendAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        BigDecimal companyTotalSpend = records.stream()
                .map(ImportedTravelRecord::getCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, List<ImportedTravelRecord>> byDept = records.stream()
                .collect(Collectors.groupingBy(r -> r.getDepartment() != null && !r.getDepartment().isBlank()
                        ? r.getDepartment().trim()
                        : "General / Unassigned"));

        List<DepartmentSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byDept.entrySet()) {
            String dept = entry.getKey();
            List<ImportedTravelRecord> deptRecords = entry.getValue();

            BigDecimal deptSpend = deptRecords.stream()
                    .map(ImportedTravelRecord::getCost)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            long tripCount = deptRecords.size();
            long empCount = deptRecords.stream()
                    .map(r -> r.getRawEmployeeIdentifier() != null ? r.getRawEmployeeIdentifier() : r.getRawEmployeeName())
                    .filter(Objects::nonNull)
                    .distinct()
                    .count();

            BigDecimal avgPerEmp = empCount > 0
                    ? deptSpend.divide(BigDecimal.valueOf(empCount), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            double share = companyTotalSpend.compareTo(BigDecimal.ZERO) > 0
                    ? deptSpend.divide(companyTotalSpend, 4, RoundingMode.HALF_UP).doubleValue() * 100.0
                    : 0.0;

            result.add(new DepartmentSpendSummary(
                    dept,
                    deptSpend,
                    empCount,
                    tripCount,
                    avgPerEmp,
                    Math.round(share * 10.0) / 10.0
            ));
        }

        result.sort(Comparator.comparing(DepartmentSpendSummary::totalSpend).reversed());
        return result;
    }

    /**
     * Destination & Route Analysis: Top destinations, routes, and domestic vs international.
     */
    public DestinationAnalysis getDestinationAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        // Top destinations
        Map<String, List<ImportedTravelRecord>> byDest = records.stream()
                .filter(r -> r.getToLocation() != null && !r.getToLocation().isBlank())
                .collect(Collectors.groupingBy(r -> r.getToLocation().trim()));

        List<DestinationAnalysis.DestinationMetric> destList = new ArrayList<>();
        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byDest.entrySet()) {
            String dest = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();
            long trips = list.size();
            BigDecimal spend = list.stream().map(ImportedTravelRecord::getCost).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            long costCount = list.stream().filter(r -> r.getCost() != null).count();
            BigDecimal avg = costCount > 0 ? spend.divide(BigDecimal.valueOf(costCount), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            destList.add(new DestinationAnalysis.DestinationMetric(dest, trips, spend, avg));
        }
        destList.sort(Comparator.comparing(DestinationAnalysis.DestinationMetric::tripCount).reversed());
        if (destList.size() > 10) {
            destList = destList.subList(0, 10);
        }

        // Top routes
        Map<String, List<ImportedTravelRecord>> byRoute = records.stream()
                .filter(r -> r.getFromLocation() != null && r.getToLocation() != null)
                .collect(Collectors.groupingBy(r -> r.getFromLocation().trim() + " → " + r.getToLocation().trim()));

        List<DestinationAnalysis.RouteMetric> routeList = new ArrayList<>();
        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byRoute.entrySet()) {
            String route = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();
            String[] parts = route.split(" → ");
            String from = parts[0];
            String to = parts.length > 1 ? parts[1] : "";
            long trips = list.size();
            BigDecimal spend = list.stream().map(ImportedTravelRecord::getCost).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            long costCount = list.stream().filter(r -> r.getCost() != null).count();
            BigDecimal avg = costCount > 0 ? spend.divide(BigDecimal.valueOf(costCount), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            routeList.add(new DestinationAnalysis.RouteMetric(from, to, route, trips, spend, avg));
        }
        routeList.sort(Comparator.comparing(DestinationAnalysis.RouteMetric::tripCount).reversed());
        if (routeList.size() > 10) {
            routeList = routeList.subList(0, 10);
        }

        // Domestic vs International
        long domesticTrips = 0;
        BigDecimal domesticSpend = BigDecimal.ZERO;
        long internationalTrips = 0;
        BigDecimal internationalSpend = BigDecimal.ZERO;

        for (ImportedTravelRecord r : records) {
            BigDecimal c = r.getCost() != null ? r.getCost() : BigDecimal.ZERO;
            if (isInternationalTrip(r)) {
                internationalTrips++;
                internationalSpend = internationalSpend.add(c);
            } else {
                domesticTrips++;
                domesticSpend = domesticSpend.add(c);
            }
        }

        return new DestinationAnalysis(
                destList,
                routeList,
                domesticTrips,
                domesticSpend,
                internationalTrips,
                internationalSpend
        );
    }

    /**
     * Vendor & Carrier Analysis: Airline and vendor spend distribution.
     */
    public List<VendorSpendSummary> getVendorAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        BigDecimal companyTotalSpend = records.stream()
                .map(ImportedTravelRecord::getCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, List<ImportedTravelRecord>> byVendor = records.stream()
                .collect(Collectors.groupingBy(r -> r.getProvider() != null && !r.getProvider().isBlank()
                        ? r.getProvider().trim()
                        : "Direct / Unspecified"));

        List<VendorSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byVendor.entrySet()) {
            String vendor = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();

            BigDecimal spend = list.stream()
                    .map(ImportedTravelRecord::getCost)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            long bookingCount = list.size();
            long costCount = list.stream().filter(r -> r.getCost() != null).count();
            BigDecimal avg = costCount > 0
                    ? spend.divide(BigDecimal.valueOf(costCount), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            List<String> modes = list.stream()
                    .map(ImportedTravelRecord::getTravelMode)
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();

            double share = companyTotalSpend.compareTo(BigDecimal.ZERO) > 0
                    ? spend.divide(companyTotalSpend, 4, RoundingMode.HALF_UP).doubleValue() * 100.0
                    : 0.0;

            result.add(new VendorSpendSummary(
                    vendor,
                    spend,
                    bookingCount,
                    avg,
                    modes,
                    Math.round(share * 10.0) / 10.0
            ));
        }

        result.sort(Comparator.comparing(VendorSpendSummary::totalSpend).reversed());
        return result;
    }

    /**
     * Employee Detailed History: Lifetime travel record ledger for an individual employee.
     */
    public EmployeeDetailedHistory getEmployeeDetailedHistory(User currentUser, String employeeIdentifier) {
        Company company = getRequiredCompany(currentUser);
        List<ImportedTravelRecord> records = recordRepository.findByCompanyIdAndImported(company.getId(), true).stream()
                .filter(r -> (r.getRawEmployeeIdentifier() != null && r.getRawEmployeeIdentifier().equalsIgnoreCase(employeeIdentifier))
                        || (r.getEmployee() != null && r.getEmployee().getEmployeeId() != null && r.getEmployee().getEmployeeId().equalsIgnoreCase(employeeIdentifier)))
                .sorted(Comparator.comparing(ImportedTravelRecord::getTravelDate, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(ImportedTravelRecord::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        if (records.isEmpty()) {
            throw new IllegalArgumentException("No travel history found for employee identifier: " + employeeIdentifier);
        }

        ImportedTravelRecord first = records.get(0);
        String name = first.getRawEmployeeName() != null ? first.getRawEmployeeName() : employeeIdentifier;
        String dept = records.stream().map(ImportedTravelRecord::getDepartment).filter(Objects::nonNull).findFirst().orElse("General");

        long tripCount = records.size();
        BigDecimal lifetimeSpend = records.stream()
                .map(ImportedTravelRecord::getCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long costCount = records.stream().filter(r -> r.getCost() != null).count();
        BigDecimal avgCost = costCount > 0
                ? lifetimeSpend.divide(BigDecimal.valueOf(costCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        LocalDate firstTrip = records.stream().map(ImportedTravelRecord::getTravelDate).filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
        LocalDate lastTrip = records.stream().map(ImportedTravelRecord::getTravelDate).filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);

        String topDest = records.stream()
                .map(ImportedTravelRecord::getToLocation)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(d -> d.trim().toUpperCase(), Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("—");

        // Monthly trend for this employee
        Map<String, BigDecimal> monthSpend = new TreeMap<>();
        Map<String, Long> monthTrips = new HashMap<>();

        for (ImportedTravelRecord r : records) {
            if (r.getTravelDate() != null) {
                String key = r.getTravelDate().format(MONTH_KEY_FORMAT);
                monthTrips.put(key, monthTrips.getOrDefault(key, 0L) + 1);
                if (r.getCost() != null) {
                    monthSpend.put(key, monthSpend.getOrDefault(key, BigDecimal.ZERO).add(r.getCost()));
                }
            }
        }

        List<MonthlySpendTrend> monthlyTrend = monthTrips.keySet().stream().sorted().map(key -> {
            LocalDate sample = LocalDate.parse(key + "-01");
            return new MonthlySpendTrend(
                    key,
                    sample.format(MONTH_LABEL_FORMAT),
                    monthSpend.getOrDefault(key, BigDecimal.ZERO),
                    monthTrips.getOrDefault(key, 0L),
                    1L
            );
        }).toList();

        List<ImportedRecordResponse> tripResponses = records.stream()
                .map(ImportedRecordResponse::from)
                .toList();

        return new EmployeeDetailedHistory(
                employeeIdentifier,
                name,
                dept,
                lifetimeSpend,
                tripCount,
                avgCost,
                firstTrip,
                lastTrip,
                topDest,
                tripResponses,
                monthlyTrend
        );
    }

    /**
     * Distinct departments and providers for dropdown filter options.
     */
    public List<String> getFilterDepartments(User currentUser) {
        Company company = getRequiredCompany(currentUser);
        return recordRepository.findByCompanyIdAndImported(company.getId(), true).stream()
                .map(ImportedTravelRecord::getDepartment)
                .filter(d -> d != null && !d.isBlank())
                .map(String::trim)
                .distinct()
                .sorted()
                .toList();
    }

    public List<String> getFilterProviders(User currentUser) {
        Company company = getRequiredCompany(currentUser);
        return recordRepository.findByCompanyIdAndImported(company.getId(), true).stream()
                .map(ImportedTravelRecord::getProvider)
                .filter(p -> p != null && !p.isBlank())
                .map(String::trim)
                .distinct()
                .sorted()
                .toList();
    }

    /**
     * CSV Export of Spend Intelligence Reports with CWE-1236 Formula Injection Sanitization.
     */
    public String exportSpendReportCsv(User currentUser, SpendFilter filter, String reportType) {
        String type = reportType != null ? reportType.toUpperCase() : "EXECUTIVE_SUMMARY";
        StringBuilder sb = new StringBuilder();

        switch (type) {
            case "EMPLOYEES" -> {
                sb.append("Employee ID,Employee Name,Department,Total Trips,Total Spend (INR),Avg Spend Per Trip (INR),First Trip,Most Recent Trip,Top Destination,Domestic Trips,International Trips\r\n");
                List<EmployeeSpendSummary> list = getEmployeeSpendAnalysis(currentUser, filter);
                for (EmployeeSpendSummary e : list) {
                    sb.append(escapeCsv(e.employeeIdentifier())).append(",")
                      .append(escapeCsv(e.employeeName())).append(",")
                      .append(escapeCsv(e.department())).append(",")
                      .append(e.tripCount()).append(",")
                      .append(e.totalSpend()).append(",")
                      .append(e.avgSpendPerTrip()).append(",")
                      .append(e.firstTripDate() != null ? e.firstTripDate().toString() : "").append(",")
                      .append(e.lastTripDate() != null ? e.lastTripDate().toString() : "").append(",")
                      .append(escapeCsv(e.topDestination())).append(",")
                      .append(e.domesticTrips()).append(",")
                      .append(e.internationalTrips()).append("\r\n");
                }
            }
            case "DEPARTMENTS" -> {
                sb.append("Department,Total Spend (INR),Employee Count,Total Trips,Avg Spend Per Employee (INR),Share of Total Spend (%)\r\n");
                List<DepartmentSpendSummary> list = getDepartmentSpendAnalysis(currentUser, filter);
                for (DepartmentSpendSummary d : list) {
                    sb.append(escapeCsv(d.department())).append(",")
                      .append(d.totalSpend()).append(",")
                      .append(d.employeeCount()).append(",")
                      .append(d.tripCount()).append(",")
                      .append(d.avgSpendPerEmployee()).append(",")
                      .append(d.shareOfTotalSpend()).append("\r\n");
                }
            }
            case "VENDORS" -> {
                sb.append("Carrier / Vendor,Total Spend (INR),Total Bookings,Average Booking Value (INR),Travel Modes,Share of Spend (%)\r\n");
                List<VendorSpendSummary> list = getVendorAnalysis(currentUser, filter);
                for (VendorSpendSummary v : list) {
                    sb.append(escapeCsv(v.provider())).append(",")
                      .append(v.totalSpend()).append(",")
                      .append(v.bookingCount()).append(",")
                      .append(v.avgBookingValue()).append(",")
                      .append(escapeCsv(String.join("; ", v.travelModes()))).append(",")
                      .append(v.shareOfSpend()).append("\r\n");
                }
            }
            case "DESTINATIONS" -> {
                DestinationAnalysis da = getDestinationAnalysis(currentUser, filter);
                sb.append("Top Destinations\r\n");
                sb.append("Destination,Total Trips,Total Spend (INR),Average Cost (INR)\r\n");
                for (DestinationAnalysis.DestinationMetric dm : da.topDestinations()) {
                    sb.append(escapeCsv(dm.destination())).append(",")
                      .append(dm.tripCount()).append(",")
                      .append(dm.totalSpend()).append(",")
                      .append(dm.avgCost()).append("\r\n");
                }
                sb.append("\r\nTop Routes\r\n");
                sb.append("Origin,Destination,Route,Total Trips,Total Spend (INR),Average Cost (INR)\r\n");
                for (DestinationAnalysis.RouteMetric rm : da.topRoutes()) {
                    sb.append(escapeCsv(rm.origin())).append(",")
                      .append(escapeCsv(rm.destination())).append(",")
                      .append(escapeCsv(rm.routeLabel())).append(",")
                      .append(rm.tripCount()).append(",")
                      .append(rm.totalSpend()).append(",")
                      .append(rm.avgCost()).append("\r\n");
                }
            }
            default -> {
                ExecutiveSpendOverview overview = getExecutiveOverview(currentUser, filter);
                sb.append("TRAPPLE CORPORATE TRAVEL SPEND INTELLIGENCE REPORT\r\n");
                sb.append("Report Generation Date,").append(LocalDate.now()).append("\r\n");
                sb.append("Currency,").append(overview.dataTraceability().currency()).append("\r\n");
                sb.append("Total Historical Spend,").append(overview.totalSpend()).append("\r\n");
                sb.append("Total Imported Trips,").append(overview.totalTrips()).append("\r\n");
                sb.append("Distinct Traveling Employees,").append(overview.travelerCount()).append("\r\n");
                sb.append("Average Spend Per Trip,").append(overview.avgSpendPerTrip()).append("\r\n");
                sb.append("Average Spend Per Employee,").append(overview.avgSpendPerTraveler()).append("\r\n");
                if (overview.highestSpendingEmployee() != null) {
                    sb.append("Top Spending Employee,").append(escapeCsv(overview.highestSpendingEmployee().employeeName()))
                      .append(" (").append(escapeCsv(overview.highestSpendingEmployee().employeeIdentifier())).append("),")
                      .append(overview.highestSpendingEmployee().totalSpend()).append("\r\n");
                }
                if (overview.highestSpendingDepartment() != null) {
                    sb.append("Top Spending Department,").append(escapeCsv(overview.highestSpendingDepartment().department())).append(",")
                      .append(overview.highestSpendingDepartment().totalSpend()).append("\r\n");
                }
                sb.append("Records Evaluated,").append(overview.dataTraceability().totalRecordsEvaluated()).append("\r\n");
                sb.append("Records With Cost,").append(overview.dataTraceability().recordsWithCost()).append("\r\n");
                sb.append("Records Without Cost,").append(overview.dataTraceability().recordsWithoutCost()).append("\r\n\r\n");

                sb.append("Spend by Financial Year\r\n");
                sb.append("Financial Year,Total Spend (INR),Total Trips,Distinct Travelers\r\n");
                for (FinancialYearSpend fy : overview.spendByFinancialYear()) {
                    sb.append(escapeCsv(fy.financialYear())).append(",")
                      .append(fy.totalSpend()).append(",")
                      .append(fy.tripCount()).append(",")
                      .append(fy.travelerCount()).append("\r\n");
                }
            }
        }

        return sb.toString();
    }

    private String calculateFinancialYear(LocalDate date) {
        int year = date.getYear();
        if (date.getMonthValue() >= 4) {
            return String.format("FY %d-%02d", year, (year + 1) % 100);
        } else {
            return String.format("FY %d-%02d", year - 1, year % 100);
        }
    }

    private boolean isInternationalTrip(ImportedTravelRecord r) {
        String from = r.getFromLocation() != null ? r.getFromLocation().toUpperCase() : "";
        String to = r.getToLocation() != null ? r.getToLocation().toUpperCase() : "";

        for (String indicator : INTERNATIONAL_INDICATORS) {
            if (from.contains(indicator) || to.contains(indicator)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Neutralizes formula injection characters (=, +, -, @) and wraps in quotes.
     */
    private String escapeCsv(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@")) {
            trimmed = "'" + trimmed;
        }
        if (trimmed.contains(",") || trimmed.contains("\"") || trimmed.contains("\n") || trimmed.contains("\r")) {
            trimmed = "\"" + trimmed.replace("\"", "\"\"") + "\"";
        }
        return trimmed;
    }
}
