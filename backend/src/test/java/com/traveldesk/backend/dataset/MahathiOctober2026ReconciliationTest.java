package com.traveldesk.backend.dataset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.auth.JwtService;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import com.traveldesk.backend.employee.Employee;
import com.traveldesk.backend.employee.EmployeeRepository;
import com.traveldesk.backend.employee.ImportedPassengerAliasRepository;
import com.traveldesk.backend.importdata.ImportBatchRepository;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import com.traveldesk.backend.importdata.ImportedTravelRecordRepository;
import com.traveldesk.backend.journey.DerivedJourneyRepository;
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
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Phase 9: Real-World Dataset Reconciliation — Mahathi Infra Services (October 2026)")
public class MahathiOctober2026ReconciliationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CompanyRepository companyRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private ImportBatchRepository batchRepository;

    @Autowired
    private ImportedTravelRecordRepository recordRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private TravelRecordProjectAllocationRepository allocationRepository;

    @Autowired
    private ImportedPassengerAliasRepository aliasRepository;

    @Autowired
    private DerivedJourneyRepository journeyRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private Company mahathiCompany;
    private User travelDeskUser;
    private String travelDeskToken;

    @BeforeEach
    void setup() {
        cleanAll();

        mahathiCompany = new Company();
        mahathiCompany.setName("Mahathi Infra Services Pvt. Ltd.");
        mahathiCompany.setCode("MAHATHI");
        mahathiCompany = companyRepository.save(mahathiCompany);

        travelDeskUser = new User();
        travelDeskUser.setUsername("mahathi_traveldesk");
        travelDeskUser.setPassword(passwordEncoder.encode("SecretPass123!"));
        travelDeskUser.setRole(Role.TRAVEL_DESK);
        travelDeskUser.setCompany(mahathiCompany);
        travelDeskUser = userRepository.save(travelDeskUser);

        travelDeskToken = "Bearer " + jwtService.generateToken(travelDeskUser);
    }

    @AfterEach
    void tearDown() {
        cleanAll();
    }

    private void cleanAll() {
        allocationRepository.deleteAll();
        recordRepository.deleteAll();
        journeyRepository.deleteAll();
        aliasRepository.deleteAll();
        batchRepository.deleteAll();
        userRepository.deleteAll();
        employeeRepository.deleteAll();
        projectRepository.deleteAll();
        companyRepository.deleteAll();
    }

    @Test
    @DisplayName("Inspect sheet structure")
    void testInspectWorkbookStructure() throws Exception {
        ClassPathResource resource = new ClassPathResource("testdata/mahathi_oct_2026.xlsx");
        byte[] fileBytes;
        try (InputStream is = resource.getInputStream()) {
            fileBytes = is.readAllBytes();
        }

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "AKBAR_AND_PRICOL_STATEMENT__EXCEL_OF_OCT_MONTH_2026.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileBytes
        );

        String uploadRes = mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .param("sheet", "OCT 2026 PRICOL ")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        JsonNode uploadJson = objectMapper.readTree(uploadRes);
        Long batchId = uploadJson.get("id").asLong();
        System.out.println("PRICOL BATCH: totalRows=" + uploadJson.get("totalRows") + ", valid=" + uploadJson.get("validRows") + ", errorRows=" + uploadJson.get("errorRows"));

        // Get preview records
        String recordsRes = mockMvc.perform(get("/api/imports/" + batchId + "/records?size=250")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Print all records grouped by status
        List<ImportedTravelRecord> allBatchRecords = recordRepository.findByImportBatchId(batchId);
        java.util.Map<String, Long> statusCounts = allBatchRecords.stream()
                .collect(java.util.stream.Collectors.groupingBy(ImportedTravelRecord::getStatus, java.util.stream.Collectors.counting()));
        System.out.println("STATUS BREAKDOWN: " + statusCounts);

        assertThat(statusCounts.get("VALID")).isEqualTo(172L);
        assertThat(statusCounts.get("INVALID")).isEqualTo(5L);
    }

    @Test
    @DisplayName("End-to-End Ingestion, Allocation Unpivoting, Financial Reconciliation & Journey Reconstruction")
    void testMahathiOctober2026Ledger() throws Exception {
        // 1. Load actual Excel file from test resources
        ClassPathResource resource = new ClassPathResource("testdata/mahathi_oct_2026.xlsx");
        assertThat(resource.exists()).isTrue();

        byte[] fileBytes;
        try (InputStream is = resource.getInputStream()) {
            fileBytes = is.readAllBytes();
        }

        // 2. Upload and confirm worksheets:
        // - "OCT 2026 PRICOL " (172 valid billing transactions + 5 section headers)
        // - "OCT 2026 - AKBAR Online" (4 bus travel records)
        List<String> sheets = List.of("OCT 2026 PRICOL ", "OCT 2026 - AKBAR Online");
        int cumulativeImported = 0;

        for (String sheet : sheets) {
            MockMultipartFile file = new MockMultipartFile(
                    "file",
                    "AKBAR_AND_PRICOL_STATEMENT__EXCEL_OF_OCT_MONTH_2026.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    fileBytes
            );

            String uploadRes = mockMvc.perform(multipart("/api/imports/upload")
                            .file(file)
                            .param("sheet", sheet)
                            .header("Authorization", travelDeskToken))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("PREVIEW"))
                    .andReturn().getResponse().getContentAsString();

            Long bId = objectMapper.readTree(uploadRes).get("id").asLong();

            String confirmRes = mockMvc.perform(post("/api/imports/" + bId + "/confirm")
                            .header("Authorization", travelDeskToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("COMPLETED"))
                    .andReturn().getResponse().getContentAsString();

            int imported = objectMapper.readTree(confirmRes).get("imported").asInt();
            cumulativeImported += imported;
        }

        System.out.println("CUMULATIVE IMPORTED TRANSACTIONS ACROSS WORKBOOK: " + cumulativeImported);
        assertThat(cumulativeImported).isGreaterThanOrEqualTo(170);

        // 4. Verify Phase 4: Decision 1 (Option B: Project allocations child table)
        List<TravelRecordProjectAllocation> allocations = allocationRepository.findAll();
        assertThat(allocations).isNotEmpty();

        // 5. Verify Phase 5: Decision 2 (Option B: Safe unverified employee creation)
        List<Employee> unverifiedEmployees = employeeRepository.findByCompanyId(mahathiCompany.getId()).stream()
                .filter(e -> "IMPORTED_UNVERIFIED".equals(e.getVerificationStatus()))
                .toList();
        assertThat(unverifiedEmployees).isNotEmpty();
        for (Employee emp : unverifiedEmployees) {
            assertThat(emp.getCompany().getId()).isEqualTo(mahathiCompany.getId());
            // Safe: no user account, no credentials
            assertThat(userRepository.findByEmployeeId(emp.getEmployeeId())).isEmpty();
        }

        // 6. Verify Phase 2: Decision 3 (Option A: 3-tier financial figures)
        String overviewRes = mockMvc.perform(get("/api/reports/spend/overview")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalTrips").value(cumulativeImported))
                .andReturn().getResponse().getContentAsString();

        JsonNode overviewJson = objectMapper.readTree(overviewRes);
        BigDecimal grossBilledSpend = new BigDecimal(overviewJson.get("grossSpend").asText());
        BigDecimal creditNoteReversals = new BigDecimal(overviewJson.get("creditNotesSpend").asText());
        BigDecimal netCorporateSpend = new BigDecimal(overviewJson.get("netSpend").asText());

        System.out.println("FINANCIAL RECONCILIATION AUDIT:");
        System.out.println("  Gross Billed Spend:       " + grossBilledSpend);
        System.out.println("  Credit Note Reversals:    " + creditNoteReversals);
        System.out.println("  Net Corporate Spend:      " + netCorporateSpend);

        // Net Corporate Spend MUST equal Gross - Credit Notes
        assertThat(netCorporateSpend).isEqualByComparingTo(grossBilledSpend.subtract(creditNoteReversals));
        assertThat(creditNoteReversals).isGreaterThan(BigDecimal.ZERO);

        // 7. Verify Phase 3: Zero-fare connecting transit preservation (Decision 4 - Option A)
        List<ImportedTravelRecord> zeroFareRecords = recordRepository.findAll().stream()
                .filter(r -> r.getCompany().getId().equals(mahathiCompany.getId()))
                .filter(ImportedTravelRecord::isZeroFareTransit)
                .toList();
        assertThat(zeroFareRecords).isNotEmpty();
        int zeroFareCount = overviewJson.get("zeroFareTransitCount").asInt();
        assertThat(zeroFareCount).isEqualTo(zeroFareRecords.size());
        System.out.println("  Zero-Fare Transit Legs:   " + zeroFareCount);

        // 8. Verify Credit Notes Endpoint
        int creditNoteCount = overviewJson.get("creditNotesCount").asInt();
        System.out.println("  Credit Notes Count:       " + creditNoteCount);
        assertThat(creditNoteCount).isEqualTo(11);

        mockMvc.perform(get("/api/reports/spend/credit-notes")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(11));

        // 9. Verify Modal Split Endpoint
        mockMvc.perform(get("/api/reports/spend/modal-split")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalNetSpend").isNotEmpty())
                .andExpect(jsonPath("$.categories").isArray());

        // 10. Verify Projects Spend Endpoint
        mockMvc.perform(get("/api/reports/spend/projects")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        // 11. Verify Multi-Leg Journey Aggregation Endpoint (Phase 6)
        mockMvc.perform(get("/api/reports/spend/journeys")
                        .header("Authorization", travelDeskToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }
}
