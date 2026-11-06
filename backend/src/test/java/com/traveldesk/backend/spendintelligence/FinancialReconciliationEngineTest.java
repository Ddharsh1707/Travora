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
import com.traveldesk.backend.project.Project;
import com.traveldesk.backend.project.ProjectRepository;
import com.traveldesk.backend.project.TravelRecordProjectAllocation;
import com.traveldesk.backend.project.TravelRecordProjectAllocationRepository;
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
@DisplayName("Phase 2: Financial Reconciliation Engine & Signed Calculations Test Suite")
class FinancialReconciliationEngineTest {

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
    private ProjectRepository projectRepository;

    @Autowired
    private TravelRecordProjectAllocationRepository allocationRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Company company;
    private User admin;
    private String tokenAdmin;
    private ImportBatch batch;
    private Project projectA;
    private Project projectB;

    @BeforeEach
    void setUp() {
        allocationRepository.deleteAll();
        recordRepository.deleteAll();
        batchRepository.deleteAll();
        projectRepository.deleteAll();

        company = companyRepository.findByCode("MISPL").orElseGet(() ->
                companyRepository.save(new Company("Mahathi Infra Services", "MISPL", "mahathiinfra.com"))
        );

        admin = userRepository.findByUsername("finAdmin").orElseGet(() -> {
            User u = new User();
            u.setUsername("finAdmin");
            u.setPassword(passwordEncoder.encode("secret123"));
            u.setRole(Role.COMPANY_ADMIN);
            u.setCompany(company);
            u.setActive(true);
            return userRepository.save(u);
        });
        admin.setCompany(company);
        admin = userRepository.save(admin);
        tokenAdmin = jwtService.generateToken(admin);

        projectA = projectRepository.save(new Project(company, "LIB-BUCH", "Liberia Buchanan", "ArcelorMittal", "Buchanan", new BigDecimal("1000000.00"), "ACTIVE"));
        projectB = projectRepository.save(new Project(company, "MISPL-HQ", "MISPL Corporate", "Mahathi Infra", "Hyderabad", new BigDecimal("500000.00"), "ACTIVE"));

        batch = new ImportBatch();
        batch.setCompany(company);
        batch.setUploadedBy(admin);
        batch.setOriginalFilename("october_2026_ledger.xlsx");
        batch.setFilename("batch_oct26.xlsx");
        batch.setFileType("XLSX");
        batch.setStatus("COMPLETED");
        batch.setTotalRows(5);
        batch.setImportedRows(5);
        batchRepository.save(batch);
    }

    @AfterEach
    void tearDown() {
        allocationRepository.deleteAll();
        recordRepository.deleteAll();
        batchRepository.deleteAll();
        projectRepository.deleteAll();
    }

    @Test
    @DisplayName("Financial Engine correctly reconciles Gross Spend, Credit Note Reversals, and Net Spend")
    void testGrossCreditNetReconciliation() throws Exception {
        // Record 1: Outbound Flight (Gross: ₹50,000)
        ImportedTravelRecord r1 = new ImportedTravelRecord();
        r1.setCompany(company);
        r1.setImportBatch(batch);
        r1.setRawEmployeeIdentifier("EMP001");
        r1.setRawEmployeeName("Ravi Kumar");
        r1.setDepartment("Projects");
        r1.setTravelDate(LocalDate.of(2026, 10, 5));
        r1.setFromLocation("Hyderabad");
        r1.setToLocation("Monrovia");
        r1.setTravelMode("FLIGHT");
        r1.setTravelCategory("INTERNATIONAL_FLIGHT");
        r1.setProvider("Akbar Travels");
        r1.setCost(new BigDecimal("50000.00"));
        r1.setNetCost(new BigDecimal("50000.00"));
        r1.setCreditNote(false);
        r1.setTicketReference("098-1111111111");
        r1.setProject(projectA);
        r1.setProjectName(projectA.getProjectName());
        r1.setStatus("IMPORTED");
        r1.setImported(true);
        r1.setSourceRowNumber(1);
        recordRepository.save(r1);

        // Record 2: Hotel Stay (Gross: ₹20,000)
        ImportedTravelRecord r2 = new ImportedTravelRecord();
        r2.setCompany(company);
        r2.setImportBatch(batch);
        r2.setRawEmployeeIdentifier("EMP001");
        r2.setRawEmployeeName("Ravi Kumar");
        r2.setDepartment("Projects");
        r2.setTravelDate(LocalDate.of(2026, 10, 6));
        r2.setFromLocation("Monrovia");
        r2.setToLocation("Monrovia");
        r2.setTravelMode("HOTEL");
        r2.setTravelCategory("HOTEL");
        r2.setProvider("Radisson Blu");
        r2.setCost(new BigDecimal("20000.00"));
        r2.setNetCost(new BigDecimal("20000.00"));
        r2.setCreditNote(false);
        r2.setTicketReference("HTL-9988");
        r2.setProject(projectA);
        r2.setProjectName(projectA.getProjectName());
        r2.setStatus("IMPORTED");
        r2.setImported(true);
        r2.setSourceRowNumber(2);
        recordRepository.save(r2);

        // Record 3: Zero-Fare Connecting Transit Leg (Cost: ₹0.00, isZeroFareTransit: true)
        ImportedTravelRecord r3 = new ImportedTravelRecord();
        r3.setCompany(company);
        r3.setImportBatch(batch);
        r3.setRawEmployeeIdentifier("EMP001");
        r3.setRawEmployeeName("Ravi Kumar");
        r3.setDepartment("Projects");
        r3.setTravelDate(LocalDate.of(2026, 10, 5));
        r3.setFromLocation("Monrovia");
        r3.setToLocation("Buchanan");
        r3.setTravelMode("FLIGHT");
        r3.setTravelCategory("INTERNATIONAL_FLIGHT");
        r3.setProvider("Akbar Travels");
        r3.setCost(BigDecimal.ZERO);
        r3.setNetCost(BigDecimal.ZERO);
        r3.setZeroFareTransit(true);
        r3.setCreditNote(false);
        r3.setTicketReference("098-1111111112");
        r3.setProject(projectA);
        r3.setProjectName(projectA.getProjectName());
        r3.setStatus("IMPORTED");
        r3.setImported(true);
        r3.setSourceRowNumber(3);
        recordRepository.save(r3);

        // Record 4: Credit Note Reversal (-₹10,000 refund)
        ImportedTravelRecord r4 = new ImportedTravelRecord();
        r4.setCompany(company);
        r4.setImportBatch(batch);
        r4.setRawEmployeeIdentifier("EMP001");
        r4.setRawEmployeeName("Ravi Kumar");
        r4.setDepartment("Projects");
        r4.setTravelDate(LocalDate.of(2026, 10, 10));
        r4.setFromLocation("Hyderabad");
        r4.setToLocation("Monrovia");
        r4.setTravelMode("FLIGHT");
        r4.setTravelCategory("INTERNATIONAL_FLIGHT");
        r4.setProvider("Akbar Travels");
        r4.setCost(new BigDecimal("10000.00")); // In spreadsheet entered as positive total bill value
        r4.setNetCost(new BigDecimal("-10000.00")); // Signed net cost
        r4.setCreditNote(true);
        r4.setOriginalTicketReference("098-1111111111");
        r4.setTicketReference("CN-AKB-001");
        r4.setProject(projectA);
        r4.setProjectName(projectA.getProjectName());
        r4.setStatus("IMPORTED");
        r4.setImported(true);
        r4.setSourceRowNumber(4);
        recordRepository.save(r4);

        // Expected:
        // Gross Spend: 50,000 + 20,000 = 70,000
        // Credit Notes: 10,000
        // Net Spend: 70,000 - 10,000 = 60,000
        // Total Records: 4
        // Zero-fare transit count: 1
        // Paid trips count: 2 (Record 1 + Record 2)
        // Average spend per paid trip: 70,000 / 2 = 35,000 (Zero fare and credit note excluded from average leg fare!)

        mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grossSpend", is(70000.0)))
                .andExpect(jsonPath("$.creditNotesSpend", is(10000.0)))
                .andExpect(jsonPath("$.netSpend", is(60000.0)))
                .andExpect(jsonPath("$.totalSpend", is(60000.0)))
                .andExpect(jsonPath("$.creditNotesCount", is(1)))
                .andExpect(jsonPath("$.zeroFareTransitCount", is(1)))
                .andExpect(jsonPath("$.avgSpendPerTrip", is(35000.0)));

        // Test Modal Split endpoint
        mockMvc.perform(get("/api/reports/spend/modal-split")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalGrossSpend", is(70000.0)))
                .andExpect(jsonPath("$.totalCreditNotes", is(10000.0)))
                .andExpect(jsonPath("$.totalNetSpend", is(60000.0)))
                .andExpect(jsonPath("$.categories", hasSize(greaterThanOrEqualTo(2))));

        // Test Credit Notes endpoint
        mockMvc.perform(get("/api/reports/spend/credit-notes")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].ticketReference", is("CN-AKB-001")))
                .andExpect(jsonPath("$[0].originalTicketReference", is("098-1111111111")))
                .andExpect(jsonPath("$[0].refundAmount", is(10000.0)))
                .andExpect(jsonPath("$[0].reconciliationStatus", is("MATCHED_TO_ORIGINAL")));

        // Test Projects Spend endpoint
        mockMvc.perform(get("/api/reports/spend/projects")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].projectName", is("Liberia Buchanan")))
                .andExpect(jsonPath("$[0].grossSpend", is(70000.0)))
                .andExpect(jsonPath("$[0].creditNotesSpend", is(10000.0)))
                .andExpect(jsonPath("$[0].netSpend", is(60000.0)));
    }
}

