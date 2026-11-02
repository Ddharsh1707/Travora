package com.traveldesk.backend.spendintelligence;

import com.traveldesk.backend.auth.JwtService;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import com.traveldesk.backend.importdata.ImportBatch;
import com.traveldesk.backend.importdata.ImportBatchRepository;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Centralized Travel Spend Intelligence & Analytics Suite")
class TravelSpendControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CompanyRepository companyRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ImportBatchRepository batchRepository;

    @Autowired
    private ImportedTravelRecordRepository recordRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Company companyA;
    private Company companyB;

    private User travelDeskA;
    private User approverA;
    private User adminA;
    private User travelDeskB;

    private String tokenTravelDeskA;
    private String tokenApproverA;
    private String tokenAdminA;
    private String tokenTravelDeskB;

    private ImportBatch batchA;

    @BeforeEach
    void setUp() {
        recordRepository.deleteAll();
        batchRepository.deleteAll();

        companyA = companyRepository.findByCode("MISPL").orElseGet(() ->
                companyRepository.save(new Company("Mahathi Infra Services", "MISPL", "mahathiinfra.com"))
        );
        companyB = companyRepository.findByCode("ACME").orElseGet(() ->
                companyRepository.save(new Company("Acme Corp", "ACME", "acme.com"))
        );

        travelDeskA = userRepository.findByUsername("deskA").orElseGet(() -> {
            User u = new User();
            u.setUsername("deskA");
            u.setPassword(passwordEncoder.encode("secret"));
            u.setRole(Role.TRAVEL_DESK);
            u.setCompany(companyA);
            u.setActive(true);
            return userRepository.save(u);
        });
        travelDeskA.setCompany(companyA);
        travelDeskA = userRepository.save(travelDeskA);
        tokenTravelDeskA = jwtService.generateToken(travelDeskA);

        approverA = userRepository.findByUsername("approverA").orElseGet(() -> {
            User u = new User();
            u.setUsername("approverA");
            u.setPassword(passwordEncoder.encode("secret"));
            u.setRole(Role.APPROVER);
            u.setCompany(companyA);
            u.setActive(true);
            return userRepository.save(u);
        });
        approverA.setCompany(companyA);
        approverA = userRepository.save(approverA);
        tokenApproverA = jwtService.generateToken(approverA);

        adminA = userRepository.findByUsername("adminA").orElseGet(() -> {
            User u = new User();
            u.setUsername("adminA");
            u.setPassword(passwordEncoder.encode("secret"));
            u.setRole(Role.ADMIN);
            u.setCompany(companyA);
            u.setActive(true);
            return userRepository.save(u);
        });
        adminA.setCompany(companyA);
        adminA = userRepository.save(adminA);
        tokenAdminA = jwtService.generateToken(adminA);

        travelDeskB = userRepository.findByUsername("deskB").orElseGet(() -> {
            User u = new User();
            u.setUsername("deskB");
            u.setPassword(passwordEncoder.encode("secret"));
            u.setRole(Role.TRAVEL_DESK);
            u.setCompany(companyB);
            u.setActive(true);
            return userRepository.save(u);
        });
        travelDeskB.setCompany(companyB);
        travelDeskB = userRepository.save(travelDeskB);
        tokenTravelDeskB = jwtService.generateToken(travelDeskB);

        // Seed an import batch for Company A
        batchA = new ImportBatch();
        batchA.setCompany(companyA);
        batchA.setUploadedBy(travelDeskA);
        batchA.setOriginalFilename("historical_travel_2024.xlsx");
        batchA.setFilename("batch_a_file.xlsx");
        batchA.setFileType("XLSX");
        batchA.setStatus("COMPLETED");
        batchA.setTotalRows(3);
        batchA.setImportedRows(3);
        batchRepository.save(batchA);

        // Record 1: Suresh Babu (Operations) - ₹15,000 to Delhi
        ImportedTravelRecord r1 = new ImportedTravelRecord();
        r1.setCompany(companyA);
        r1.setImportBatch(batchA);
        r1.setRawEmployeeIdentifier("MISPL0001");
        r1.setRawEmployeeName("Suresh Babu Dangeti");
        r1.setDepartment("Operations");
        r1.setTravelDate(LocalDate.of(2024, 5, 10));
        r1.setFromLocation("Hyderabad");
        r1.setToLocation("Delhi");
        r1.setTravelMode("FLIGHT");
        r1.setProvider("IndiGo");
        r1.setCost(new BigDecimal("15000.00"));
        r1.setTicketReference("6E-9021");
        r1.setStatus("IMPORTED");
        r1.setImported(true);
        r1.setSourceRowNumber(1);
        recordRepository.save(r1);

        // Record 2: Suresh Babu (Operations) - ₹12,000 to Mumbai
        ImportedTravelRecord r2 = new ImportedTravelRecord();
        r2.setCompany(companyA);
        r2.setImportBatch(batchA);
        r2.setRawEmployeeIdentifier("MISPL0001");
        r2.setRawEmployeeName("Suresh Babu Dangeti");
        r2.setDepartment("Operations");
        r2.setTravelDate(LocalDate.of(2024, 7, 20));
        r2.setFromLocation("Hyderabad");
        r2.setToLocation("Mumbai");
        r2.setTravelMode("FLIGHT");
        r2.setProvider("Air India");
        r2.setCost(new BigDecimal("12000.00"));
        r2.setTicketReference("AI-404");
        r2.setStatus("IMPORTED");
        r2.setImported(true);
        r2.setSourceRowNumber(2);
        recordRepository.save(r2);

        // Record 3: Thenmozhi (Engineering) - ₹8,500 to Chennai
        ImportedTravelRecord r3 = new ImportedTravelRecord();
        r3.setCompany(companyA);
        r3.setImportBatch(batchA);
        r3.setRawEmployeeIdentifier("MISPL0387");
        r3.setRawEmployeeName("Thenmozhi S");
        r3.setDepartment("Engineering");
        r3.setTravelDate(LocalDate.of(2024, 8, 15));
        r3.setFromLocation("Hyderabad");
        r3.setToLocation("Chennai");
        r3.setTravelMode("FLIGHT");
        r3.setProvider("IndiGo");
        r3.setCost(new BigDecimal("8500.00"));
        r3.setTicketReference("6E-1122");
        r3.setStatus("IMPORTED");
        r3.setImported(true);
        r3.setSourceRowNumber(3);
        recordRepository.save(r3);
    }

    @AfterEach
    void tearDown() {
        recordRepository.deleteAll();
        batchRepository.deleteAll();
    }

    @Test
    @DisplayName("Travel Desk and Approver can both access Executive Overview with accurate calculations")
    void testExecutiveOverviewAccessAndCalculations() throws Exception {
        // 1. Travel Desk access
        mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", "Bearer " + tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSpend", is(35500.0)))
                .andExpect(jsonPath("$.totalTrips", is(3)))
                .andExpect(jsonPath("$.travelerCount", is(2)))
                .andExpect(jsonPath("$.avgSpendPerTrip", is(11833.33)))
                .andExpect(jsonPath("$.avgSpendPerTraveler", is(17750.0)))
                .andExpect(jsonPath("$.highestSpendingEmployee.employeeIdentifier", is("MISPL0001")))
                .andExpect(jsonPath("$.highestSpendingEmployee.totalSpend", is(27000.0)))
                .andExpect(jsonPath("$.highestSpendingDepartment.department", is("Operations")))
                .andExpect(jsonPath("$.highestSpendingDepartment.totalSpend", is(27000.0)))
                .andExpect(jsonPath("$.dataTraceability.totalRecordsEvaluated", is(3)))
                .andExpect(jsonPath("$.dataTraceability.recordsWithCost", is(3)))
                .andExpect(jsonPath("$.dataTraceability.recordsWithoutCost", is(0)));

        // 2. Approver access (same company receives identical accurate analytics)
        mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", "Bearer " + tokenApproverA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSpend", is(35500.0)))
                .andExpect(jsonPath("$.totalTrips", is(3)));

        // 3. Admin access
        mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", "Bearer " + tokenAdminA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSpend", is(35500.0)));
    }

    @Test
    @DisplayName("Tenant Isolation: Company B cannot see Company A's historical travel spend")
    void testTenantIsolation() throws Exception {
        mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", "Bearer " + tokenTravelDeskB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSpend", is(0)))
                .andExpect(jsonPath("$.totalTrips", is(0)))
                .andExpect(jsonPath("$.travelerCount", is(0)));
    }

    @Test
    @DisplayName("Employee Analysis returns ranked traveler metrics")
    void testEmployeeAnalysis() throws Exception {
        mockMvc.perform(get("/api/reports/spend/employees")
                        .header("Authorization", "Bearer " + tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].employeeIdentifier", is("MISPL0001")))
                .andExpect(jsonPath("$[0].totalSpend", is(27000.0)))
                .andExpect(jsonPath("$[0].tripCount", is(2)))
                .andExpect(jsonPath("$[1].employeeIdentifier", is("MISPL0387")))
                .andExpect(jsonPath("$[1].totalSpend", is(8500.0)))
                .andExpect(jsonPath("$[1].tripCount", is(1)));
    }

    @Test
    @DisplayName("Employee Detailed Trip History retrieves individual chronological records")
    void testEmployeeDetailedHistory() throws Exception {
        mockMvc.perform(get("/api/reports/spend/employee/MISPL0001")
                        .header("Authorization", "Bearer " + tokenApproverA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employeeIdentifier", is("MISPL0001")))
                .andExpect(jsonPath("$.employeeName", is("Suresh Babu Dangeti")))
                .andExpect(jsonPath("$.lifetimeSpend", is(27000.0)))
                .andExpect(jsonPath("$.lifetimeTrips", is(2)))
                .andExpect(jsonPath("$.trips", hasSize(2)));
    }

    @Test
    @DisplayName("Department, Destination, and Vendor breakdowns compute accurately")
    void testDepartmentAndVendorAnalysis() throws Exception {
        // Departments
        mockMvc.perform(get("/api/reports/spend/departments")
                        .header("Authorization", "Bearer " + tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].department", is("Operations")))
                .andExpect(jsonPath("$[0].totalSpend", is(27000.0)))
                .andExpect(jsonPath("$[1].department", is("Engineering")))
                .andExpect(jsonPath("$[1].totalSpend", is(8500.0)));

        // Destinations
        mockMvc.perform(get("/api/reports/spend/destinations")
                        .header("Authorization", "Bearer " + tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.topDestinations", hasSize(3)))
                .andExpect(jsonPath("$.domesticTrips", is(3)))
                .andExpect(jsonPath("$.internationalTrips", is(0)));

        // Vendors
        mockMvc.perform(get("/api/reports/spend/vendors")
                        .header("Authorization", "Bearer " + tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].provider", is("IndiGo")))
                .andExpect(jsonPath("$[0].totalSpend", is(23500.0)))
                .andExpect(jsonPath("$[1].provider", is("Air India")))
                .andExpect(jsonPath("$[1].totalSpend", is(12000.0)));
    }

    @Test
    @DisplayName("CSV Export works and protects against formula injection")
    void testCsvExport() throws Exception {
        mockMvc.perform(get("/api/reports/spend/export?type=EMPLOYEES")
                        .header("Authorization", "Bearer " + tokenApproverA))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("spend_report_employees")))
                .andExpect(content().string(containsString("MISPL0001")))
                .andExpect(content().string(containsString("Suresh Babu Dangeti")))
                .andExpect(content().string(containsString("27000.00")));
    }

    @Test
    @DisplayName("Unauthenticated request is rejected")
    void testUnauthenticatedAccessFails() throws Exception {
        mockMvc.perform(get("/api/reports/spend/overview"))
                .andExpect(status().isForbidden());
    }
}
