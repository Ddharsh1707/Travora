package com.traveldesk.backend.spendintelligence;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import com.traveldesk.backend.employee.Employee;
import com.traveldesk.backend.employee.ImportedPassengerAliasRepository;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import com.traveldesk.backend.journey.DerivedJourney;
import com.traveldesk.backend.journey.DerivedJourneyRepository;
import com.traveldesk.backend.project.Project;
import com.traveldesk.backend.project.ProjectRepository;
import com.traveldesk.backend.project.TravelRecordProjectAllocation;
import com.traveldesk.backend.project.TravelRecordProjectAllocationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class TravelSpendService {

    private final ImportedTravelRecordRepository recordRepository;
    private final CompanyRepository companyRepository;
    private final ProjectRepository projectRepository;
    private final TravelRecordProjectAllocationRepository allocationRepository;
    private final ImportedPassengerAliasRepository aliasRepository;
    private final DerivedJourneyRepository journeyRepository;

    private static final DateTimeFormatter MONTH_KEY_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final DateTimeFormatter MONTH_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM yyyy");

    // Common international airport/city indicators for Indian corporate travel
    private static final Set<String> INTERNATIONAL_INDICATORS = Set.of(
            "DUBAI", "DXB", "SINGAPORE", "SIN", "LONDON", "LHR", "LGW", "NEW YORK", "JFK",
            "DOHA", "DOH", "ABU DHABI", "AUH", "BANGKOK", "BKK", "KUALA LUMPUR", "KUL",
            "FRANKFURT", "FRA", "PARIS", "CDG", "TOKYO", "NRT", "HND", "HONG KONG", "HKG",
            "COLOMBO", "CMB", "DHAKA", "DAC", "KATHMANDU", "KTM", "MUSCAT", "MCT",
            "BAHRAIN", "BAH", "KUWAIT", "KWI", "RIYADH", "RUH", "JEDDAH", "JED",
            "SYDNEY", "SYD", "MELBOURNE", "MEL", "TORONTO", "YYZ", "CHICAGO", "ORD",
            "SAN FRANCISCO", "SFO", "DALLAS", "DFW", "AMSTERDAM", "AMS", "ZURICH", "ZRH",
            "ROB", "MONROVIA", "LIBERIA", "MAURITIUS", "MRU", "BUCHANAN", "THOKADEH"
    );

    @Autowired
    public TravelSpendService(
            ImportedTravelRecordRepository recordRepository,
            CompanyRepository companyRepository,
            ProjectRepository projectRepository,
            TravelRecordProjectAllocationRepository allocationRepository,
            ImportedPassengerAliasRepository aliasRepository,
            DerivedJourneyRepository journeyRepository
    ) {
        this.recordRepository = recordRepository;
        this.companyRepository = companyRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.aliasRepository = aliasRepository;
        this.journeyRepository = journeyRepository;
    }

    public TravelSpendService(
            ImportedTravelRecordRepository recordRepository,
            CompanyRepository companyRepository
    ) {
        this(recordRepository, companyRepository, null, null, null, null);
    }

    private Company getRequiredCompany(User currentUser) {
        if (currentUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User account is not authenticated.");
        }
        if (currentUser.getCompany() != null) {
            return currentUser.getCompany();
        }
        // Fallback for administrative users or initial setups
        return companyRepository.findByCode("MISPL")
                .or(() -> companyRepository.findAll().stream().findFirst())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "User account is not associated with an active company tenant."));
    }

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

        String empId = (filter.employeeId() != null && !filter.employeeId().isBlank()) ? filter.employeeId().trim() : null;
        String dept = (filter.department() != null && !filter.department().isBlank()) ? filter.department().trim() : null;
        String prov = (filter.provider() != null && !filter.provider().isBlank()) ? filter.provider().trim() : null;
        String mode = (filter.travelMode() != null && !filter.travelMode().isBlank()) ? filter.travelMode().trim() : null;
        String search = (filter.search() != null && !filter.search().isBlank()) ? filter.search().trim() : null;

        List<ImportedTravelRecord> records = recordRepository.findFilteredForSpendAnalysis(
                company.getId(),
                empId,
                dept,
                prov,
                mode,
                dates.fromDate(),
                dates.toDate(),
                search
        );

        // Memory filtering for new optional dimensions
        if (filter.projectName() != null && !filter.projectName().isBlank()) {
            String pName = filter.projectName().trim().toLowerCase();
            records = records.stream()
                    .filter(r -> (r.getProjectName() != null && r.getProjectName().toLowerCase().contains(pName)) ||
                                 (r.getProject() != null && r.getProject().getProjectName().toLowerCase().contains(pName)))
                    .collect(Collectors.toList());
        }
        if (filter.travelCategory() != null && !filter.travelCategory().isBlank()) {
            String cat = filter.travelCategory().trim().toUpperCase();
            records = records.stream()
                    .filter(r -> r.getTravelCategory() != null && r.getTravelCategory().equalsIgnoreCase(cat))
                    .collect(Collectors.toList());
        }
        if (filter.isCreditNote() != null) {
            boolean cnOnly = filter.isCreditNote();
            records = records.stream()
                    .filter(r -> r.isCreditNote() == cnOnly)
                    .collect(Collectors.toList());
        }

        return records;
    }

    /**
     * Executive Overview: Core metrics, Month-on-Month trends, Financial Year distribution.
     * Enforces Decision 3 (Option A: Gross, Credit, Net spend) and Decision 4 (Zero-fare exclusion from avg fare).
     */
    public ExecutiveSpendOverview getExecutiveOverview(User currentUser, SpendFilter filter) {
        ResolvedDates dates = resolveDates(filter);
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        return buildExecutiveOverview(records, dates);
    }

    public ExecutiveSpendOverview buildExecutiveOverview(List<ImportedTravelRecord> records, ResolvedDates dates) {
        long totalRecordsEvaluated = records.size();
        long recordsWithCost = 0;
        BigDecimal grossSpend = BigDecimal.ZERO;
        BigDecimal creditNotesSpend = BigDecimal.ZERO;
        long creditNotesCount = 0;
        long zeroFareTransitCount = 0;
        long paidTripsCount = 0;

        Set<String> distinctTravelers = new HashSet<>();
        LocalDate earliestDate = null;
        LocalDate latestDate = null;

        Map<String, BigDecimal> empGrossMap = new HashMap<>();
        Map<String, BigDecimal> empCreditMap = new HashMap<>();
        Map<String, String> employeeNameMap = new HashMap<>();
        Map<String, String> employeeDeptMap = new HashMap<>();
        Map<String, Long> employeeTripCountMap = new HashMap<>();

        Map<String, BigDecimal> deptGrossMap = new HashMap<>();
        Map<String, BigDecimal> deptCreditMap = new HashMap<>();
        Map<String, Long> deptTripCountMap = new HashMap<>();
        Map<String, Set<String>> deptTravelersMap = new HashMap<>();

        Map<String, BigDecimal> fyGrossMap = new HashMap<>();
        Map<String, BigDecimal> fyCreditMap = new HashMap<>();
        Map<String, Long> fyTripCountMap = new HashMap<>();
        Map<String, Set<String>> fyTravelersMap = new HashMap<>();

        Map<String, BigDecimal> monthGrossMap = new HashMap<>();
        Map<String, BigDecimal> monthCreditMap = new HashMap<>();
        Map<String, Long> monthTripCountMap = new HashMap<>();
        Map<String, Set<String>> monthTravelersMap = new HashMap<>();

        for (ImportedTravelRecord r : records) {
            String empId = (r.getRawEmployeeIdentifier() != null && !r.getRawEmployeeIdentifier().isBlank())
                    ? r.getRawEmployeeIdentifier().trim()
                    : (r.getEmployee() != null && r.getEmployee().getEmployeeId() != null && !r.getEmployee().getEmployeeId().isBlank()
                        ? r.getEmployee().getEmployeeId().trim()
                        : (r.getRawEmployeeName() != null && !r.getRawEmployeeName().isBlank() ? r.getRawEmployeeName().trim() : "UNKNOWN"));

            String empName = (r.getRawEmployeeName() != null && !r.getRawEmployeeName().isBlank() && !r.getRawEmployeeName().equals("—"))
                    ? r.getRawEmployeeName().trim()
                    : (r.getEmployee() != null && r.getEmployee().getName() != null && !r.getEmployee().getName().isBlank()
                        ? r.getEmployee().getName().trim()
                        : empId);

            String dept = (r.getDepartment() != null && !r.getDepartment().isBlank())
                    ? r.getDepartment().trim()
                    : (r.getEmployee() != null && r.getEmployee().getDepartment() != null && !r.getEmployee().getDepartment().isBlank()
                        ? r.getEmployee().getDepartment().trim()
                        : "General");

            distinctTravelers.add(empId);

            String fy = null;
            String monthKey = null;
            if (r.getTravelDate() != null) {
                if (earliestDate == null || r.getTravelDate().isBefore(earliestDate)) {
                    earliestDate = r.getTravelDate();
                }
                if (latestDate == null || r.getTravelDate().isAfter(latestDate)) {
                    latestDate = r.getTravelDate();
                }
                fy = calculateFinancialYear(r.getTravelDate());
                monthKey = r.getTravelDate().format(MONTH_KEY_FORMAT);

                fyTripCountMap.put(fy, fyTripCountMap.getOrDefault(fy, 0L) + 1);
                fyTravelersMap.computeIfAbsent(fy, k -> new HashSet<>()).add(empId);

                monthTripCountMap.put(monthKey, monthTripCountMap.getOrDefault(monthKey, 0L) + 1);
                monthTravelersMap.computeIfAbsent(monthKey, k -> new HashSet<>()).add(empId);
            }

            employeeTripCountMap.put(empId, employeeTripCountMap.getOrDefault(empId, 0L) + 1);
            employeeNameMap.putIfAbsent(empId, empName);
            employeeDeptMap.putIfAbsent(empId, dept);

            deptTripCountMap.put(dept, deptTripCountMap.getOrDefault(dept, 0L) + 1);
            deptTravelersMap.computeIfAbsent(dept, k -> new HashSet<>()).add(empId);

            BigDecimal effectiveCost = r.getNetCost() != null ? r.getNetCost() : r.getCost();
            boolean isCN = r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0);
            boolean isZero = r.isZeroFareTransit() || (effectiveCost != null && effectiveCost.compareTo(BigDecimal.ZERO) == 0 && "DOMESTIC_FLIGHT".equalsIgnoreCase(r.getTravelCategory()));

            if (isCN) {
                creditNotesCount++;
                recordsWithCost++;
                BigDecimal absCredit = effectiveCost != null ? effectiveCost.abs() : BigDecimal.ZERO;
                creditNotesSpend = creditNotesSpend.add(absCredit);
                empCreditMap.put(empId, empCreditMap.getOrDefault(empId, BigDecimal.ZERO).add(absCredit));
                deptCreditMap.put(dept, deptCreditMap.getOrDefault(dept, BigDecimal.ZERO).add(absCredit));
                if (fy != null) {
                    fyCreditMap.put(fy, fyCreditMap.getOrDefault(fy, BigDecimal.ZERO).add(absCredit));
                    monthCreditMap.put(monthKey, monthCreditMap.getOrDefault(monthKey, BigDecimal.ZERO).add(absCredit));
                }
            } else if (isZero) {
                zeroFareTransitCount++;
            } else if (effectiveCost != null && effectiveCost.compareTo(BigDecimal.ZERO) > 0) {
                recordsWithCost++;
                paidTripsCount++;
                BigDecimal absGross = effectiveCost.abs();
                grossSpend = grossSpend.add(absGross);
                empGrossMap.put(empId, empGrossMap.getOrDefault(empId, BigDecimal.ZERO).add(absGross));
                deptGrossMap.put(dept, deptGrossMap.getOrDefault(dept, BigDecimal.ZERO).add(absGross));
                if (fy != null) {
                    fyGrossMap.put(fy, fyGrossMap.getOrDefault(fy, BigDecimal.ZERO).add(absGross));
                    monthGrossMap.put(monthKey, monthGrossMap.getOrDefault(monthKey, BigDecimal.ZERO).add(absGross));
                }
            }
        }

        BigDecimal netSpend = grossSpend.subtract(creditNotesSpend);
        long travelerCount = distinctTravelers.size();

        // Average spend per paid ticket/trip: Excludes zero-fare transit legs and credit notes!
        BigDecimal avgSpendPerTrip = paidTripsCount > 0
                ? grossSpend.divide(BigDecimal.valueOf(paidTripsCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        BigDecimal avgSpendPerTraveler = travelerCount > 0
                ? netSpend.divide(BigDecimal.valueOf(travelerCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // Top Spender (Ranked by net spend)
        ExecutiveSpendOverview.TopSpender topSpender = null;
        if (!empGrossMap.isEmpty() || !empCreditMap.isEmpty()) {
            Set<String> allEmpIds = new HashSet<>(empGrossMap.keySet());
            allEmpIds.addAll(empCreditMap.keySet());

            String topEmp = allEmpIds.stream()
                    .max(Comparator.comparing(id -> empGrossMap.getOrDefault(id, BigDecimal.ZERO).subtract(empCreditMap.getOrDefault(id, BigDecimal.ZERO))))
                    .orElse(null);

            if (topEmp != null) {
                BigDecimal g = empGrossMap.getOrDefault(topEmp, BigDecimal.ZERO);
                BigDecimal c = empCreditMap.getOrDefault(topEmp, BigDecimal.ZERO);
                BigDecimal n = g.subtract(c);
                topSpender = new ExecutiveSpendOverview.TopSpender(
                        topEmp,
                        employeeNameMap.getOrDefault(topEmp, topEmp),
                        employeeDeptMap.getOrDefault(topEmp, "General"),
                        n, // totalSpend = netSpend
                        g,
                        c,
                        n,
                        employeeTripCountMap.getOrDefault(topEmp, 0L)
                );
            }
        }

        // Top Department (Ranked by net spend)
        ExecutiveSpendOverview.TopDepartment topDept = null;
        if (!deptGrossMap.isEmpty() || !deptCreditMap.isEmpty()) {
            Set<String> allDepts = new HashSet<>(deptGrossMap.keySet());
            allDepts.addAll(deptCreditMap.keySet());

            String topD = allDepts.stream()
                    .max(Comparator.comparing(d -> deptGrossMap.getOrDefault(d, BigDecimal.ZERO).subtract(deptCreditMap.getOrDefault(d, BigDecimal.ZERO))))
                    .orElse(null);

            if (topD != null) {
                BigDecimal g = deptGrossMap.getOrDefault(topD, BigDecimal.ZERO);
                BigDecimal c = deptCreditMap.getOrDefault(topD, BigDecimal.ZERO);
                BigDecimal n = g.subtract(c);
                topDept = new ExecutiveSpendOverview.TopDepartment(
                        topD,
                        n, // totalSpend = netSpend
                        g,
                        c,
                        n,
                        deptTripCountMap.getOrDefault(topD, 0L),
                        deptTravelersMap.getOrDefault(topD, Collections.emptySet()).size()
                );
            }
        }

        // Financial Year Spend
        List<FinancialYearSpend> fyList = fyTripCountMap.keySet().stream()
                .sorted(Comparator.reverseOrder())
                .map(fy -> {
                    BigDecimal g = fyGrossMap.getOrDefault(fy, BigDecimal.ZERO);
                    BigDecimal c = fyCreditMap.getOrDefault(fy, BigDecimal.ZERO);
                    BigDecimal n = g.subtract(c);
                    return new FinancialYearSpend(
                            fy,
                            n, // totalSpend
                            g,
                            c,
                            n,
                            fyTripCountMap.getOrDefault(fy, 0L),
                            fyTravelersMap.getOrDefault(fy, Collections.emptySet()).size()
                    );
                })
                .toList();

        // Month-on-Month Spend
        List<MonthlySpendTrend> monthList = monthTripCountMap.keySet().stream()
                .sorted()
                .map(mKey -> {
                    String mLabel = mKey;
                    try {
                        LocalDate sample = LocalDate.parse(mKey + "-01");
                        mLabel = sample.format(MONTH_LABEL_FORMAT);
                    } catch (Exception ignored) {}
                    BigDecimal g = monthGrossMap.getOrDefault(mKey, BigDecimal.ZERO);
                    BigDecimal c = monthCreditMap.getOrDefault(mKey, BigDecimal.ZERO);
                    BigDecimal n = g.subtract(c);
                    return new MonthlySpendTrend(
                            mKey,
                            mLabel,
                            n, // totalSpend
                            g,
                            c,
                            n,
                            monthTripCountMap.getOrDefault(mKey, 0L),
                            monthTravelersMap.getOrDefault(mKey, Collections.emptySet()).size()
                    );
                })
                .toList();

        ExecutiveSpendOverview.DataTraceability traceability = new ExecutiveSpendOverview.DataTraceability(
                totalRecordsEvaluated,
                recordsWithCost,
                totalRecordsEvaluated - recordsWithCost,
                dates.fromDate() != null ? dates.fromDate() : earliestDate,
                dates.toDate() != null ? dates.toDate() : latestDate,
                "INR"
        );

        return new ExecutiveSpendOverview(
                netSpend,
                grossSpend,
                creditNotesSpend,
                netSpend,
                totalRecordsEvaluated,
                travelerCount,
                avgSpendPerTrip,
                avgSpendPerTraveler,
                creditNotesCount,
                zeroFareTransitCount,
                topSpender,
                topDept,
                fyList,
                monthList,
                traceability
        );
    }

    /**
     * Employee Travel Analysis: Aggregate breakdown per employee with Gross, Credit, Net spend and Verification Status.
     */
    public List<EmployeeSpendSummary> getEmployeeSpendAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        return buildEmployeeSpendAnalysis(records);
    }

    public List<EmployeeSpendSummary> buildEmployeeSpendAnalysis(List<ImportedTravelRecord> records) {
        Map<String, List<ImportedTravelRecord>> byEmployee = records.stream()
                .collect(Collectors.groupingBy(r -> {
                    if (r.getRawEmployeeIdentifier() != null && !r.getRawEmployeeIdentifier().isBlank()) {
                        return r.getRawEmployeeIdentifier().trim();
                    }
                    if (r.getEmployee() != null && r.getEmployee().getEmployeeId() != null && !r.getEmployee().getEmployeeId().isBlank()) {
                        return r.getEmployee().getEmployeeId().trim();
                    }
                    if (r.getRawEmployeeName() != null && !r.getRawEmployeeName().isBlank() && !r.getRawEmployeeName().equals("—")) {
                        return r.getRawEmployeeName().trim();
                    }
                    if (r.getEmployee() != null && r.getEmployee().getName() != null && !r.getEmployee().getName().isBlank()) {
                        return r.getEmployee().getName().trim();
                    }
                    return "UNKNOWN";
                }));

        List<EmployeeSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byEmployee.entrySet()) {
            String empId = entry.getKey();
            List<ImportedTravelRecord> empRecords = entry.getValue();

            String name = empRecords.stream()
                    .map(r -> {
                        if (r.getRawEmployeeName() != null && !r.getRawEmployeeName().isBlank() && !r.getRawEmployeeName().equals("—")) {
                            return r.getRawEmployeeName().trim();
                        }
                        if (r.getEmployee() != null && r.getEmployee().getName() != null && !r.getEmployee().getName().isBlank()) {
                            return r.getEmployee().getName().trim();
                        }
                        return null;
                    })
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(empId);

            String dept = empRecords.stream()
                    .map(r -> {
                        if (r.getDepartment() != null && !r.getDepartment().isBlank()) {
                            return r.getDepartment().trim();
                        }
                        if (r.getEmployee() != null && r.getEmployee().getDepartment() != null && !r.getEmployee().getDepartment().isBlank()) {
                            return r.getEmployee().getDepartment().trim();
                        }
                        return null;
                    })
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse("General");

            String vStatus = empRecords.stream()
                    .map(r -> r.getEmployee() != null ? r.getEmployee().getVerificationStatus() : null)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse("VERIFIED");

            long tripCount = empRecords.size();
            BigDecimal empGross = BigDecimal.ZERO;
            BigDecimal empCredits = BigDecimal.ZERO;
            long paidTrips = 0;

            for (ImportedTravelRecord r : empRecords) {
                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) empCredits = empCredits.add(eff.abs());
                } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                    empGross = empGross.add(eff.abs());
                    paidTrips++;
                }
            }

            BigDecimal empNet = empGross.subtract(empCredits);
            BigDecimal avgSpend = paidTrips > 0
                    ? empGross.divide(BigDecimal.valueOf(paidTrips), 2, RoundingMode.HALF_UP)
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

            String topDest = empRecords.stream()
                    .map(ImportedTravelRecord::getToLocation)
                    .filter(loc -> loc != null && !loc.isBlank())
                    .collect(Collectors.groupingBy(String::trim, Collectors.counting()))
                    .entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse("—");

            long internationalCount = empRecords.stream().filter(this::isInternationalTrip).count();
            long domesticCount = tripCount - internationalCount;

            result.add(new EmployeeSpendSummary(
                    empId,
                    name,
                    dept,
                    tripCount,
                    empNet, // totalSpend
                    empGross,
                    empCredits,
                    empNet,
                    avgSpend,
                    firstDate,
                    lastDate,
                    topDest,
                    domesticCount,
                    internationalCount,
                    vStatus
            ));
        }

        result.sort(Comparator.comparing(EmployeeSpendSummary::netSpend).reversed());
        return result;
    }

    /**
     * Department-wise Expenditure: Gross, Credit, Net spend per department.
     */
    public List<DepartmentSpendSummary> getDepartmentSpendAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        return buildDepartmentSpendAnalysis(records);
    }

    public List<DepartmentSpendSummary> buildDepartmentSpendAnalysis(List<ImportedTravelRecord> records) {
        BigDecimal companyTotalGross = BigDecimal.ZERO;
        BigDecimal companyTotalCredits = BigDecimal.ZERO;

        for (ImportedTravelRecord r : records) {
            BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
            if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                if (eff != null) companyTotalCredits = companyTotalCredits.add(eff.abs());
            } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                companyTotalGross = companyTotalGross.add(eff.abs());
            }
        }
        BigDecimal companyTotalNet = companyTotalGross.subtract(companyTotalCredits);

        Map<String, List<ImportedTravelRecord>> byDept = records.stream()
                .collect(Collectors.groupingBy(r -> r.getDepartment() != null && !r.getDepartment().isBlank()
                        ? r.getDepartment().trim()
                        : "General / Unassigned"));

        List<DepartmentSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byDept.entrySet()) {
            String dept = entry.getKey();
            List<ImportedTravelRecord> deptRecords = entry.getValue();

            BigDecimal deptGross = BigDecimal.ZERO;
            BigDecimal deptCredits = BigDecimal.ZERO;

            for (ImportedTravelRecord r : deptRecords) {
                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) deptCredits = deptCredits.add(eff.abs());
                } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                    deptGross = deptGross.add(eff.abs());
                }
            }

            BigDecimal deptNet = deptGross.subtract(deptCredits);
            long tripCount = deptRecords.size();
            long empCount = deptRecords.stream()
                    .map(r -> r.getRawEmployeeIdentifier() != null ? r.getRawEmployeeIdentifier() : r.getRawEmployeeName())
                    .filter(Objects::nonNull)
                    .distinct()
                    .count();

            BigDecimal avgPerEmp = empCount > 0
                    ? deptNet.divide(BigDecimal.valueOf(empCount), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            double share = companyTotalNet.compareTo(BigDecimal.ZERO) > 0
                    ? deptNet.divide(companyTotalNet, 4, RoundingMode.HALF_UP).doubleValue() * 100.0
                    : 0.0;

            result.add(new DepartmentSpendSummary(
                    dept,
                    deptNet,
                    deptGross,
                    deptCredits,
                    deptNet,
                    empCount,
                    tripCount,
                    avgPerEmp,
                    Math.round(share * 10.0) / 10.0
            ));
        }

        result.sort(Comparator.comparing(DepartmentSpendSummary::netSpend).reversed());
        return result;
    }

    /**
     * Destination & Route Analysis.
     */
    public DestinationAnalysis getDestinationAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        return buildDestinationAnalysis(records);
    }

    public DestinationAnalysis buildDestinationAnalysis(List<ImportedTravelRecord> records) {
        Map<String, List<ImportedTravelRecord>> byDest = records.stream()
                .filter(r -> r.getToLocation() != null && !r.getToLocation().isBlank())
                .collect(Collectors.groupingBy(r -> r.getToLocation().trim()));

        List<DestinationAnalysis.DestinationMetric> destList = new ArrayList<>();
        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byDest.entrySet()) {
            String dest = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();
            long count = list.size();
            BigDecimal spend = list.stream()
                    .map(r -> r.getNetCost() != null ? r.getNetCost() : r.getCost())
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            long empCount = list.stream()
                    .map(r -> r.getRawEmployeeIdentifier() != null ? r.getRawEmployeeIdentifier() : r.getRawEmployeeName())
                    .filter(Objects::nonNull)
                    .distinct()
                    .count();

            BigDecimal avgCost = count > 0 ? spend.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            destList.add(new DestinationAnalysis.DestinationMetric(dest, count, spend, avgCost));
        }
        destList.sort(Comparator.comparing(DestinationAnalysis.DestinationMetric::tripCount).reversed());
        if (destList.size() > 10) destList = destList.subList(0, 10);

        // Top routes
        Map<String, List<ImportedTravelRecord>> byRoute = records.stream()
                .filter(r -> r.getFromLocation() != null && !r.getFromLocation().isBlank() && r.getToLocation() != null && !r.getToLocation().isBlank())
                .collect(Collectors.groupingBy(r -> r.getFromLocation().trim() + " → " + r.getToLocation().trim()));

        List<DestinationAnalysis.RouteMetric> routeList = new ArrayList<>();
        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byRoute.entrySet()) {
            String route = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();
            String[] parts = route.split(" → ");
            String from = parts[0];
            String to = parts.length > 1 ? parts[1] : "";
            long trips = list.size();
            BigDecimal spend = list.stream()
                    .map(r -> r.getNetCost() != null ? r.getNetCost() : r.getCost())
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal avg = trips > 0 ? spend.divide(BigDecimal.valueOf(trips), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            routeList.add(new DestinationAnalysis.RouteMetric(from, to, route, trips, spend, avg));
        }
        routeList.sort(Comparator.comparing(DestinationAnalysis.RouteMetric::tripCount).reversed());
        if (routeList.size() > 10) routeList = routeList.subList(0, 10);

        long domesticTrips = 0;
        BigDecimal domesticSpend = BigDecimal.ZERO;
        long internationalTrips = 0;
        BigDecimal internationalSpend = BigDecimal.ZERO;

        for (ImportedTravelRecord r : records) {
            BigDecimal c = r.getNetCost() != null ? r.getNetCost() : (r.getCost() != null ? r.getCost() : BigDecimal.ZERO);
            if (isInternationalTrip(r)) {
                internationalTrips++;
                internationalSpend = internationalSpend.add(c);
            } else {
                domesticTrips++;
                domesticSpend = domesticSpend.add(c);
            }
        }

        return new DestinationAnalysis(destList, routeList, domesticTrips, domesticSpend, internationalTrips, internationalSpend);
    }

    /**
     * Vendor & Carrier Analysis: Airline and vendor spend distribution with Gross, Credit, Net.
     */
    public List<VendorSpendSummary> getVendorAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        return buildVendorAnalysis(records);
    }

    public List<VendorSpendSummary> buildVendorAnalysis(List<ImportedTravelRecord> records) {
        BigDecimal companyTotalGross = BigDecimal.ZERO;
        BigDecimal companyTotalCredits = BigDecimal.ZERO;

        for (ImportedTravelRecord r : records) {
            BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
            if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                if (eff != null) companyTotalCredits = companyTotalCredits.add(eff.abs());
            } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                companyTotalGross = companyTotalGross.add(eff.abs());
            }
        }
        BigDecimal companyTotalNet = companyTotalGross.subtract(companyTotalCredits);

        Map<String, List<ImportedTravelRecord>> byVendor = records.stream()
                .collect(Collectors.groupingBy(r -> r.getProvider() != null && !r.getProvider().isBlank()
                        ? r.getProvider().trim()
                        : "Direct / Unspecified"));

        List<VendorSpendSummary> result = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byVendor.entrySet()) {
            String vendor = entry.getKey();
            List<ImportedTravelRecord> list = entry.getValue();

            BigDecimal vendorGross = BigDecimal.ZERO;
            BigDecimal vendorCredits = BigDecimal.ZERO;

            for (ImportedTravelRecord r : list) {
                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) vendorCredits = vendorCredits.add(eff.abs());
                } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                    vendorGross = vendorGross.add(eff.abs());
                }
            }

            BigDecimal vendorNet = vendorGross.subtract(vendorCredits);
            long count = list.size();
            BigDecimal avg = count > 0 ? vendorNet.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            List<String> modes = list.stream()
                    .map(ImportedTravelRecord::getTravelMode)
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();

            double share = companyTotalNet.compareTo(BigDecimal.ZERO) > 0
                    ? vendorNet.divide(companyTotalNet, 4, RoundingMode.HALF_UP).doubleValue() * 100.0
                    : 0.0;

            result.add(new VendorSpendSummary(
                    vendor,
                    vendorNet,
                    vendorGross,
                    vendorCredits,
                    vendorNet,
                    count,
                    avg,
                    modes,
                    Math.round(share * 10.0) / 10.0
            ));
        }

        result.sort(Comparator.comparing(VendorSpendSummary::netSpend).reversed());
        return result;
    }

    /**
     * Project Intelligence Analysis: Project-level allocations, budgets, and net spend.
     */
    public List<ProjectSpendSummary> getProjectSpendAnalysis(User currentUser, SpendFilter filter) {
        Company company = getRequiredCompany(currentUser);
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);
        List<Project> allProjects = projectRepository != null ? projectRepository.findByCompanyIdOrderByProjectNameAsc(company.getId()) : Collections.emptyList();

        Map<Long, Project> projectMap = allProjects.stream().collect(Collectors.toMap(Project::getId, p -> p));

        // Group records and allocations by project
        Map<String, List<ImportedTravelRecord>> byProjectName = new HashMap<>();
        for (ImportedTravelRecord r : records) {
            String pName = null;
            if (r.getProject() != null) {
                pName = r.getProject().getProjectName();
            } else if (r.getProjectName() != null && !r.getProjectName().isBlank()) {
                pName = r.getProjectName().trim();
            } else {
                pName = "Unassigned / General";
            }
            byProjectName.computeIfAbsent(pName, k -> new ArrayList<>()).add(r);
        }

        List<ProjectSpendSummary> summaries = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byProjectName.entrySet()) {
            String pName = entry.getKey();
            List<ImportedTravelRecord> pRecords = entry.getValue();

            BigDecimal pGross = BigDecimal.ZERO;
            BigDecimal pCredits = BigDecimal.ZERO;
            Set<String> travelers = new HashSet<>();

            for (ImportedTravelRecord r : pRecords) {
                String traveler = r.getRawEmployeeIdentifier() != null ? r.getRawEmployeeIdentifier() : r.getRawEmployeeName();
                if (traveler != null) travelers.add(traveler);

                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) pCredits = pCredits.add(eff.abs());
                } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                    pGross = pGross.add(eff.abs());
                }
            }

            BigDecimal pNet = pGross.subtract(pCredits);

            // Match to project entity if available
            Project proj = allProjects.stream()
                    .filter(p -> p.getProjectName().equalsIgnoreCase(pName) || p.getProjectCode().equalsIgnoreCase(pName))
                    .findFirst()
                    .orElse(null);

            Long pId = proj != null ? proj.getId() : null;
            String pCode = proj != null ? proj.getProjectCode() : pName.toUpperCase().replaceAll("[^A-Z0-9]", "_");
            String client = proj != null ? proj.getClientName() : null;
            String loc = proj != null ? proj.getLocation() : null;
            BigDecimal budget = proj != null ? proj.getBudgetAmount() : null;
            String status = proj != null ? proj.getStatus() : "ACTIVE";

            Double utilPct = null;
            if (budget != null && budget.compareTo(BigDecimal.ZERO) > 0) {
                utilPct = pNet.divide(budget, 4, RoundingMode.HALF_UP).doubleValue() * 100.0;
            }

            String topRoute = pRecords.stream()
                    .filter(r -> r.getFromLocation() != null && r.getToLocation() != null)
                    .collect(Collectors.groupingBy(r -> r.getFromLocation().trim() + " - " + r.getToLocation().trim(), Collectors.counting()))
                    .entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse("—");

            summaries.add(new ProjectSpendSummary(
                    pId,
                    pCode,
                    pName,
                    client,
                    loc,
                    budget,
                    status,
                    pGross,
                    pCredits,
                    pNet,
                    pRecords.size(),
                    travelers.size(),
                    utilPct,
                    topRoute
            ));
        }

        summaries.sort(Comparator.comparing(ProjectSpendSummary::netSpend).reversed());
        return summaries;
    }

    /**
     * Modal Split Analysis: Domestic Flights, International Flights, Hotels, Bus, Visa.
     */
    public ModalSplitSummary getModalSplitAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        BigDecimal totalGross = BigDecimal.ZERO;
        BigDecimal totalCredits = BigDecimal.ZERO;

        Map<String, List<ImportedTravelRecord>> byCat = new HashMap<>();

        for (ImportedTravelRecord r : records) {
            String cat = r.getTravelCategory();
            if (cat == null || cat.isBlank()) {
                if (isInternationalTrip(r)) {
                    cat = "INTERNATIONAL_FLIGHT";
                } else if ("HOTEL".equalsIgnoreCase(r.getTravelMode())) {
                    cat = "HOTEL";
                } else if ("BUS".equalsIgnoreCase(r.getTravelMode())) {
                    cat = "BUS";
                } else {
                    cat = "DOMESTIC_FLIGHT";
                }
            }
            byCat.computeIfAbsent(cat.toUpperCase(), k -> new ArrayList<>()).add(r);

            BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
            if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                if (eff != null) totalCredits = totalCredits.add(eff.abs());
            } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                totalGross = totalGross.add(eff.abs());
            }
        }

        BigDecimal totalNet = totalGross.subtract(totalCredits);

        Map<String, String> displayNames = Map.of(
                "DOMESTIC_FLIGHT", "Domestic Flights",
                "INTERNATIONAL_FLIGHT", "International Flights",
                "HOTEL", "Hotels & Stays",
                "BUS", "Bus Travel",
                "VISA", "Visa Services",
                "OTHER", "Other Ancillaries"
        );

        List<ModalSplitSummary.CategorySplitItem> items = new ArrayList<>();

        for (Map.Entry<String, List<ImportedTravelRecord>> entry : byCat.entrySet()) {
            String cat = entry.getKey();
            List<ImportedTravelRecord> cRecords = entry.getValue();

            BigDecimal catGross = BigDecimal.ZERO;
            BigDecimal catCredits = BigDecimal.ZERO;
            long units = 0;

            for (ImportedTravelRecord r : cRecords) {
                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) catCredits = catCredits.add(eff.abs());
                } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                    catGross = catGross.add(eff.abs());
                    units++;
                }
            }

            BigDecimal catNet = catGross.subtract(catCredits);
            double share = totalNet.compareTo(BigDecimal.ZERO) > 0
                    ? catNet.divide(totalNet, 4, RoundingMode.HALF_UP).doubleValue() * 100.0
                    : 0.0;

            BigDecimal avgCost = units > 0
                    ? catGross.divide(BigDecimal.valueOf(units), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            items.add(new ModalSplitSummary.CategorySplitItem(
                    cat,
                    displayNames.getOrDefault(cat, cat),
                    catGross,
                    catCredits,
                    catNet,
                    Math.round(share * 10.0) / 10.0,
                    cRecords.size(),
                    avgCost
            ));
        }

        items.sort(Comparator.comparing(ModalSplitSummary.CategorySplitItem::netSpend).reversed());
        return new ModalSplitSummary(totalGross, totalCredits, totalNet, items);
    }

    /**
     * Credit Note Reconciliation & Audit Analysis.
     */
    public List<CreditNoteSummary> getCreditNotesAnalysis(User currentUser, SpendFilter filter) {
        List<ImportedTravelRecord> records = getFilteredRecords(currentUser, filter);

        List<CreditNoteSummary> creditNotes = new ArrayList<>();

        for (ImportedTravelRecord r : records) {
            boolean isCN = r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0);
            if (!isCN) continue;

            BigDecimal refund = r.getNetCost() != null ? r.getNetCost().abs() : (r.getCost() != null ? r.getCost().abs() : BigDecimal.ZERO);
            String pName = r.getProject() != null ? r.getProject().getProjectName() : (r.getProjectName() != null ? r.getProjectName() : "MISPL");

            String status = "UNMATCHED";
            if (r.getOriginalTicketReference() != null && !r.getOriginalTicketReference().isBlank()) {
                status = "MATCHED_TO_ORIGINAL";
            }

            creditNotes.add(new CreditNoteSummary(
                    r.getId(),
                    r.getTicketReference() != null ? r.getTicketReference() : "CN-" + r.getId(),
                    r.getOriginalTicketReference(),
                    r.getRawEmployeeName() != null ? r.getRawEmployeeName() : "—",
                    r.getTravelDate(),
                    r.getProvider() != null ? r.getProvider() : "Akbar Travels",
                    refund,
                    pName,
                    r.getTravelCategory(),
                    status
            ));
        }

        return creditNotes;
    }

    /**
     * Multi-Leg Journey Intelligence Analysis.
     */
    public List<JourneySummary> getJourneyAnalysis(User currentUser, SpendFilter filter) {
        Company company = getRequiredCompany(currentUser);
        if (journeyRepository == null) return Collections.emptyList();

        ResolvedDates dates = resolveDates(filter);
        List<DerivedJourney> journeys = journeyRepository.searchJourneys(
                company.getId(),
                filter.search(),
                dates.fromDate(),
                dates.toDate(),
                org.springframework.data.domain.PageRequest.of(0, 100)
        ).getContent();

        List<JourneySummary> summaries = new ArrayList<>();
        for (DerivedJourney j : journeys) {
            summaries.add(new JourneySummary(
                    j.getId(),
                    j.getJourneyUid(),
                    j.getPrimaryPnr(),
                    j.getPassengerName(),
                    j.getEmployee() != null ? j.getEmployee().getEmployeeId() : "—",
                    j.getJourneyType(),
                    j.getOrigin(),
                    j.getDestination(),
                    j.getStartDate(),
                    j.getEndDate(),
                    j.getTotalLegs(),
                    j.getGrossSpend(),
                    j.getTotalRefunds(),
                    j.getNetSpend(),
                    Collections.emptyList()
            ));
        }

        return summaries;
    }

    public CombinedSpendIntelligence getCombinedIntelligence(User currentUser, SpendFilter filter) {
        ExecutiveSpendOverview overview = getExecutiveOverview(currentUser, filter);
        List<EmployeeSpendSummary> employees = getEmployeeSpendAnalysis(currentUser, filter);
        List<DepartmentSpendSummary> departments = getDepartmentSpendAnalysis(currentUser, filter);
        DestinationAnalysis destinations = getDestinationAnalysis(currentUser, filter);
        List<VendorSpendSummary> vendors = getVendorAnalysis(currentUser, filter);
        List<ProjectSpendSummary> projects = getProjectSpendAnalysis(currentUser, filter);
        ModalSplitSummary modalSplit = getModalSplitAnalysis(currentUser, filter);
        List<CreditNoteSummary> creditNotes = getCreditNotesAnalysis(currentUser, filter);

        return new CombinedSpendIntelligence(
                overview,
                employees,
                departments,
                destinations,
                vendors,
                projects,
                modalSplit,
                creditNotes
        );
    }

    public EmployeeDetailedHistory getEmployeeDetailedHistory(User currentUser, String employeeIdentifier) {
        Company company = getRequiredCompany(currentUser);
        String trimmedIdentifier = employeeIdentifier != null ? employeeIdentifier.trim() : "";
        List<ImportedTravelRecord> records = recordRepository.findByCompanyIdAndEmployeeIdentifier(company.getId(), trimmedIdentifier);

        if (records.isEmpty()) {
            records = recordRepository.findFilteredForSpendAnalysis(
                    company.getId(), null, null, null, null, null, null, trimmedIdentifier
            );
        }

        if (records.isEmpty()) {
            throw new IllegalArgumentException("No travel history found for employee identifier: " + employeeIdentifier);
        }

        ImportedTravelRecord first = records.get(0);
        String name = (first.getRawEmployeeName() != null && !first.getRawEmployeeName().isBlank() && !first.getRawEmployeeName().equals("—"))
                ? first.getRawEmployeeName().trim()
                : (first.getEmployee() != null && first.getEmployee().getName() != null && !first.getEmployee().getName().isBlank()
                    ? first.getEmployee().getName().trim()
                    : trimmedIdentifier);

        String dept = records.stream()
                .map(r -> {
                    if (r.getDepartment() != null && !r.getDepartment().isBlank()) return r.getDepartment().trim();
                    if (r.getEmployee() != null && r.getEmployee().getDepartment() != null && !r.getEmployee().getDepartment().isBlank()) return r.getEmployee().getDepartment().trim();
                    return null;
                })
                .filter(Objects::nonNull)
                .findFirst()
                .orElse("General");

        String resolvedIdentifier = (first.getRawEmployeeIdentifier() != null && !first.getRawEmployeeIdentifier().isBlank())
                ? first.getRawEmployeeIdentifier().trim()
                : (first.getEmployee() != null && first.getEmployee().getEmployeeId() != null && !first.getEmployee().getEmployeeId().isBlank()
                    ? first.getEmployee().getEmployeeId().trim()
                    : trimmedIdentifier);

        long tripCount = records.size();
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal credits = BigDecimal.ZERO;
        long paidTrips = 0;

        for (ImportedTravelRecord r : records) {
            BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
            if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                if (eff != null) credits = credits.add(eff.abs());
            } else if (!r.isZeroFareTransit() && eff != null && eff.compareTo(BigDecimal.ZERO) > 0) {
                gross = gross.add(eff.abs());
                paidTrips++;
            }
        }

        BigDecimal netSpend = gross.subtract(credits);
        BigDecimal avgCost = paidTrips > 0
                ? gross.divide(BigDecimal.valueOf(paidTrips), 2, RoundingMode.HALF_UP)
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

        Map<String, BigDecimal> monthGross = new TreeMap<>();
        Map<String, BigDecimal> monthCredits = new TreeMap<>();
        Map<String, Long> monthTrips = new HashMap<>();

        for (ImportedTravelRecord r : records) {
            if (r.getTravelDate() != null) {
                String key = r.getTravelDate().format(MONTH_KEY_FORMAT);
                monthTrips.put(key, monthTrips.getOrDefault(key, 0L) + 1);
                BigDecimal eff = r.getNetCost() != null ? r.getNetCost() : r.getCost();
                if (r.isCreditNote() || (r.getCost() != null && r.getCost().compareTo(BigDecimal.ZERO) < 0)) {
                    if (eff != null) monthCredits.put(key, monthCredits.getOrDefault(key, BigDecimal.ZERO).add(eff.abs()));
                } else if (eff != null) {
                    monthGross.put(key, monthGross.getOrDefault(key, BigDecimal.ZERO).add(eff.abs()));
                }
            }
        }

        List<MonthlySpendTrend> monthlyTrend = monthTrips.keySet().stream().sorted().map(key -> {
            String monthLabel = key;
            try {
                LocalDate sample = LocalDate.parse(key + "-01");
                monthLabel = sample.format(MONTH_LABEL_FORMAT);
            } catch (Exception ignored) {}
            BigDecimal g = monthGross.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal c = monthCredits.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal n = g.subtract(c);
            return new MonthlySpendTrend(
                    key,
                    monthLabel,
                    n, // totalSpend
                    g,
                    c,
                    n,
                    monthTrips.getOrDefault(key, 0L),
                    1L
            );
        }).toList();

        List<com.traveldesk.backend.importdata.ImportedRecordResponse> tripResponses = records.stream()
                .map(com.traveldesk.backend.importdata.ImportedRecordResponse::from)
                .toList();

        return new EmployeeDetailedHistory(
                resolvedIdentifier,
                name,
                dept,
                netSpend, // lifetimeSpend
                tripCount,
                avgCost,
                firstTrip,
                lastTrip,
                topDest,
                tripResponses,
                monthlyTrend
        );
    }

    public List<String> getFilterDepartments(User currentUser) {
        Company company = getRequiredCompany(currentUser);
        return recordRepository.findDistinctDepartmentsByCompanyId(company.getId());
    }

    public List<String> getFilterProviders(User currentUser) {
        Company company = getRequiredCompany(currentUser);
        return recordRepository.findDistinctProvidersByCompanyId(company.getId());
    }

    public String exportSpendReportCsv(User currentUser, SpendFilter filter, String reportType) {
        StringBuilder csv = new StringBuilder();
        String type = reportType != null ? reportType.toUpperCase() : "EXECUTIVE_SUMMARY";

        switch (type) {
            case "PROJECT_SPEND" -> {
                csv.append("Project Code,Project Name,Client,Gross Spend (INR),Credit Notes (INR),Net Spend (INR),Trips,Travelers,Budget Utilization (%)\n");
                for (ProjectSpendSummary p : getProjectSpendAnalysis(currentUser, filter)) {
                    csv.append(sanitizeCsv(p.projectCode())).append(",")
                       .append(sanitizeCsv(p.projectName())).append(",")
                       .append(sanitizeCsv(p.clientName() != null ? p.clientName() : "—")).append(",")
                       .append(p.grossSpend()).append(",")
                       .append(p.creditNotesSpend()).append(",")
                       .append(p.netSpend()).append(",")
                       .append(p.tripCount()).append(",")
                       .append(p.distinctTravelers()).append(",")
                       .append(p.budgetUtilizationPct() != null ? String.format("%.2f%%", p.budgetUtilizationPct()) : "N/A").append("\n");
                }
            }
            case "CREDIT_NOTES" -> {
                csv.append("Credit Note Ref,Original Ticket Ref,Passenger,Travel Date,Vendor,Project,Refund (INR),Reconciliation Status\n");
                for (CreditNoteSummary c : getCreditNotesAnalysis(currentUser, filter)) {
                    csv.append(sanitizeCsv(c.ticketReference())).append(",")
                       .append(sanitizeCsv(c.originalTicketReference() != null ? c.originalTicketReference() : "—")).append(",")
                       .append(sanitizeCsv(c.passengerName())).append(",")
                       .append(c.travelDate() != null ? c.travelDate() : "—").append(",")
                       .append(sanitizeCsv(c.provider())).append(",")
                       .append(sanitizeCsv(c.projectName())).append(",")
                       .append(c.refundAmount()).append(",")
                       .append(sanitizeCsv(c.reconciliationStatus())).append("\n");
                }
            }
            case "EMPLOYEES" -> {
                csv.append("Employee ID,Name,Department,Total Trips,Gross Spend (INR),Credit Notes (INR),Net Spend (INR),Avg Spend/Trip (INR),Verification Status\n");
                for (EmployeeSpendSummary e : getEmployeeSpendAnalysis(currentUser, filter)) {
                    csv.append(sanitizeCsv(e.employeeIdentifier())).append(",")
                       .append(sanitizeCsv(e.employeeName())).append(",")
                       .append(sanitizeCsv(e.department())).append(",")
                       .append(e.tripCount()).append(",")
                       .append(e.grossSpend()).append(",")
                       .append(e.creditNotesSpend()).append(",")
                       .append(e.netSpend()).append(",")
                       .append(e.avgSpendPerTrip()).append(",")
                       .append(sanitizeCsv(e.verificationStatus())).append("\n");
                }
            }
            default -> {
                csv.append("Financial Year,Month,Gross Spend (INR),Credit Notes (INR),Net Spend (INR),Trips,Travelers\n");
                ExecutiveSpendOverview o = getExecutiveOverview(currentUser, filter);
                for (MonthlySpendTrend m : o.monthOnMonthSpend()) {
                    csv.append(calculateFinancialYear(LocalDate.parse(m.monthKey() + "-01"))).append(",")
                       .append(sanitizeCsv(m.monthLabel())).append(",")
                       .append(m.grossSpend()).append(",")
                       .append(m.creditNotesSpend()).append(",")
                       .append(m.netSpend()).append(",")
                       .append(m.tripCount()).append(",")
                       .append(m.travelerCount()).append("\n");
                }
            }
        }
        return csv.toString();
    }

    private String sanitizeCsv(String val) {
        if (val == null) return "\"\"";
        String s = val.replace("\"", "\"\"");
        if (s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@")) {
            s = "'" + s;
        }
        return "\"" + s + "\"";
    }

    private boolean isInternationalTrip(ImportedTravelRecord r) {
        if ("INTERNATIONAL_FLIGHT".equalsIgnoreCase(r.getTravelCategory())) return true;
        if (r.getToLocation() != null) {
            String upper = r.getToLocation().toUpperCase();
            for (String ind : INTERNATIONAL_INDICATORS) {
                if (upper.contains(ind)) return true;
            }
        }
        if (r.getFromLocation() != null) {
            String upper = r.getFromLocation().toUpperCase();
            for (String ind : INTERNATIONAL_INDICATORS) {
                if (upper.contains(ind)) return true;
            }
        }
        return false;
    }

    private String calculateFinancialYear(LocalDate date) {
        if (date == null) return "Unknown";
        int year = date.getYear();
        int month = date.getMonthValue();
        return month >= 4 ? String.format("FY %d-%02d", year, (year + 1) % 100)
                          : String.format("FY %d-%02d", year - 1, year % 100);
    }
}
