package com.traveldesk.backend.importdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.auth.JwtService;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import com.traveldesk.backend.employee.Employee;
import com.traveldesk.backend.employee.EmployeeRepository;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Excel Import & Travel History Security and Processing Suite")
class ImportControllerTest {

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
    private com.traveldesk.backend.journey.DerivedJourneyRepository journeyRepository;

    @Autowired
    private com.traveldesk.backend.employee.ImportedPassengerAliasRepository aliasRepository;

    @Autowired
    private com.traveldesk.backend.project.TravelRecordProjectAllocationRepository allocationRepository;

    @Autowired
    private com.traveldesk.backend.project.ProjectRepository projectRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private Company companyA;
    private Company companyB;

    private User adminA;
    private User travelDeskA;
    private User employeeA;
    private User adminB;

    private String tokenAdminA;
    private String tokenTravelDeskA;
    private String tokenEmployeeA;
    private String tokenAdminB;

    @BeforeEach
    void setup() {
        allocationRepository.deleteAll();
        recordRepository.deleteAll();
        journeyRepository.deleteAll();
        aliasRepository.deleteAll();
        batchRepository.deleteAll();
        userRepository.deleteAll();
        employeeRepository.deleteAll();
        projectRepository.deleteAll();
        companyRepository.deleteAll();

        companyA = new Company();
        companyA.setName("Acme Corp");
        companyA.setCode("ACME");
        companyA = companyRepository.save(companyA);

        companyB = new Company();
        companyB.setName("Beta Corp");
        companyB.setCode("BETA");
        companyB = companyRepository.save(companyB);

        // Seed employee in companyA
        Employee emp1 = new Employee();
        emp1.setCompany(companyA);
        emp1.setEmployeeId("EMP001");
        emp1.setName("Alice Walker");
        emp1.setDepartment("Engineering");
        emp1.setActive(true);
        employeeRepository.save(emp1);

        adminA = createUser("admin_a", "password123", Role.COMPANY_ADMIN, companyA, null);
        travelDeskA = createUser("desk_a", "password123", Role.TRAVEL_DESK, companyA, null);
        employeeA = createUser("emp_a", "password123", Role.EMPLOYEE, companyA, "EMP001");
        adminB = createUser("admin_b", "password123", Role.COMPANY_ADMIN, companyB, null);

        tokenAdminA = "Bearer " + jwtService.generateToken(adminA);
        tokenTravelDeskA = "Bearer " + jwtService.generateToken(travelDeskA);
        tokenEmployeeA = "Bearer " + jwtService.generateToken(employeeA);
        tokenAdminB = "Bearer " + jwtService.generateToken(adminB);
    }

    @AfterEach
    void tearDown() {
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

    private User createUser(String username, String rawPassword, Role role, Company company, String employeeId) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(rawPassword));
        u.setRole(role);
        u.setCompany(company);
        u.setEmployeeId(employeeId);
        u.setActive(true);
        return userRepository.save(u);
    }

    private byte[] createSampleXlsx(String sheetName) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            XSSFSheet sheet = wb.createSheet(sheetName);
            Row h = sheet.createRow(0);
            h.createCell(0).setCellValue("Employee ID");
            h.createCell(1).setCellValue("Employee Name");
            h.createCell(2).setCellValue("Travel Date");
            h.createCell(3).setCellValue("From");
            h.createCell(4).setCellValue("To");
            h.createCell(5).setCellValue("Ticket Number");
            h.createCell(6).setCellValue("Cost");

            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("EMP001");
            r1.createCell(1).setCellValue("Alice Walker");
            r1.createCell(2).setCellValue("2026-05-10");
            r1.createCell(3).setCellValue("New York");
            r1.createCell(4).setCellValue("London");
            r1.createCell(5).setCellValue("BA-1002");
            r1.createCell(6).setCellValue(1250.0);

            Row r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("EMP999");
            r2.createCell(1).setCellValue("Unknown Person");
            r2.createCell(2).setCellValue("2026-06-15");
            r2.createCell(3).setCellValue("Chicago");
            r2.createCell(4).setCellValue("Tokyo");
            r2.createCell(5).setCellValue("JL-405");
            r2.createCell(6).setCellValue(1800.0);

            wb.write(bos);
            return bos.toByteArray();
        }
    }

    @Test
    @DisplayName("1. Upload valid XLSX by Travel Desk returns preview with mapped rows")
    void upload_validXlsx_returnsPreview() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("TravelData");
        MockMultipartFile file = new MockMultipartFile(
                "file", "trips.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBytes
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.status").value("PREVIEW"))
                .andExpect(jsonPath("$.fileType").value("XLSX"))
                .andExpect(jsonPath("$.totalRows").value(2))
                .andExpect(jsonPath("$.validRows").value(2))
                .andExpect(jsonPath("$.columnMapping.employeeId").value("Employee ID"))
                .andExpect(jsonPath("$.columnMapping.travelDate").value("Travel Date"));
    }

    @Test
    @DisplayName("2. Upload valid CSV file returns preview")
    void upload_validCsv_returnsPreview() throws Exception {
        String csvContent = "Employee ID,Passenger Name,Travel Date,Origin,Destination,PNR,Amount\n" +
                "EMP001,Alice Walker,2026-07-01,San Francisco,Seattle,DL-889,320.00\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "history.csv", "text/csv", csvContent.getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenAdminA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileType").value("CSV"))
                .andExpect(jsonPath("$.totalRows").value(1))
                .andExpect(jsonPath("$.validRows").value(1));
    }

    @Test
    @DisplayName("3. Upload invalid file type returns 400 Bad Request")
    void upload_invalidFileType_returns400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "report.pdf", "application/pdf", new byte[]{1, 2, 3}
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("4. Upload empty file returns 400 Bad Request")
    void upload_emptyFile_returns400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.csv", "text/csv", new byte[0]
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("5. Unauthenticated upload is blocked with 401 or 403")
    void upload_unauthenticated_returns401() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "test.csv", "text/csv", "Employee ID\nEMP001\n".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/imports/upload").file(file))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("6. Employee role cannot upload spreadsheets (returns 403 Forbidden)")
    void upload_employeeRole_returns403() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "test.csv", "text/csv", "Employee ID\nEMP001\n".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenEmployeeA))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("7. Get preview records returns matched employee and confidence")
    void getRecords_returnsPagedPreview() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("TravelData");
        MockMultipartFile file = new MockMultipartFile("file", "trips.xlsx", "application/octet-stream", xlsxBytes);

        String responseJson = mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        Long batchId = objectMapper.readTree(responseJson).get("id").asLong();

        mockMvc.perform(get("/api/imports/" + batchId + "/records")
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.content[0].rawEmployeeIdentifier").value("EMP001"))
                .andExpect(jsonPath("$.content[0].matchConfidence").value("HIGH"))
                .andExpect(jsonPath("$.content[0].status").value("MATCHED"))
                .andExpect(jsonPath("$.content[1].rawEmployeeIdentifier").value("EMP999"))
                .andExpect(jsonPath("$.content[1].matchConfidence").value("NONE"))
                .andExpect(jsonPath("$.content[1].status").value("VALID"));
    }

    @Test
    @DisplayName("8. Update column mapping re-processes records without re-uploading file")
    void updateMapping_reprocessesRecords() throws Exception {
        String csvContent = "BadgeNumber,Traveler,FlyDate,OriginCity,DestCity\n" +
                "EMP001,Alice Walker,2026-08-10,Austin,Denver\n";
        MockMultipartFile file = new MockMultipartFile("file", "custom.csv", "text/csv", csvContent.getBytes(StandardCharsets.UTF_8));

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();

        // Custom mapping
        Map<String, String> newMap = Map.of(
                "employeeId", "BadgeNumber",
                "employeeName", "Traveler",
                "travelDate", "FlyDate",
                "fromLocation", "OriginCity",
                "toLocation", "DestCity"
        );

        mockMvc.perform(put("/api/imports/" + batchId + "/mapping")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateMappingRequest(newMap, "Default")))
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.columnMapping.employeeId").value("BadgeNumber"));

        // Verify updated record
        mockMvc.perform(get("/api/imports/" + batchId + "/records").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].rawEmployeeIdentifier").value("EMP001"))
                .andExpect(jsonPath("$.content[0].fromLocation").value("Austin"))
                .andExpect(jsonPath("$.content[0].toLocation").value("Denver"));
    }

    @Test
    @DisplayName("9. Confirm import persists records to travel history")
    void confirmImport_persistsValidRecords() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("Sheet1");
        MockMultipartFile file = new MockMultipartFile("file", "trips.xlsx", "application/octet-stream", xlsxBytes);

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();

        // Confirm
        mockMvc.perform(post("/api/imports/" + batchId + "/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.imported").value(2));

        // Travel history should now find records
        mockMvc.perform(get("/api/imports/travel-history").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)));
    }

    @Test
    @DisplayName("10. Confirm import skips duplicate records when re-imported")
    void confirmImport_skipsDuplicates() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("Sheet1");
        MockMultipartFile file1 = new MockMultipartFile("file", "batch1.xlsx", "application/octet-stream", xlsxBytes);

        String res1 = mockMvc.perform(multipart("/api/imports/upload").file(file1).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batch1Id = objectMapper.readTree(res1).get("id").asLong();

        // Import batch 1
        mockMvc.perform(post("/api/imports/" + batch1Id + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(2));

        // Upload same file as batch 2
        MockMultipartFile file2 = new MockMultipartFile("file", "batch2.xlsx", "application/octet-stream", xlsxBytes);
        String res2 = mockMvc.perform(multipart("/api/imports/upload").file(file2).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batch2Id = objectMapper.readTree(res2).get("id").asLong();

        // Import batch 2 -> duplicate row for EMP001 should be skipped
        mockMvc.perform(post("/api/imports/" + batch2Id + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skipped").value(greaterThanOrEqualTo(1)));
    }

    @Test
    @DisplayName("11. Attempting to confirm a completed batch returns 409 Conflict")
    void confirmImport_previewBatchOnly_rejectsCompletedBatch() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("Sheet1");
        MockMultipartFile file = new MockMultipartFile("file", "trips.xlsx", "application/octet-stream", xlsxBytes);

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();

        mockMvc.perform(post("/api/imports/" + batchId + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk());

        // Second confirm should fail
        mockMvc.perform(post("/api/imports/" + batchId + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("12. Company B cannot access Company A's import batch (404 Not Found)")
    void crossCompany_cannotAccessOtherBatch_returns404() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("Sheet1");
        MockMultipartFile file = new MockMultipartFile("file", "trips.xlsx", "application/octet-stream", xlsxBytes);

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();

        // Admin B attempts to access Company A's batch
        mockMvc.perform(get("/api/imports/" + batchId).header("Authorization", tokenAdminB))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/imports/" + batchId + "/records").header("Authorization", tokenAdminB))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("13. Search travel history respects company isolation")
    void searchTravelHistory_respectsCompanyIsolation() throws Exception {
        byte[] xlsxBytes = createSampleXlsx("Sheet1");
        MockMultipartFile file = new MockMultipartFile("file", "trips.xlsx", "application/octet-stream", xlsxBytes);

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();
        mockMvc.perform(post("/api/imports/" + batchId + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk());

        // Company A sees 2 records
        mockMvc.perform(get("/api/imports/travel-history").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)));

        // Company B sees 0 records
        mockMvc.perform(get("/api/imports/travel-history").header("Authorization", tokenAdminB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(0)));
    }

    @Test
    @DisplayName("14. Export travel history to CSV includes formula injection protection")
    void exportCsv_containsFormulaProtection() throws Exception {
        // Upload record with formula trigger
        String csvContent = "Employee ID,Passenger Name,Travel Date,Origin,Destination\n" +
                "=1+1,Alice Walker,2026-09-01,@London,-Paris\n";
        MockMultipartFile file = new MockMultipartFile("file", "formula.csv", "text/csv", csvContent.getBytes(StandardCharsets.UTF_8));

        String res = mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long batchId = objectMapper.readTree(res).get("id").asLong();
        mockMvc.perform(post("/api/imports/" + batchId + "/confirm").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk());

        String exported = mockMvc.perform(get("/api/imports/travel-history/export").header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andReturn().getResponse().getContentAsString();

        // Formula triggers should be neutralized with single quote prefix
        org.junit.jupiter.api.Assertions.assertTrue(exported.contains("\"'=1+1\""));
        org.junit.jupiter.api.Assertions.assertTrue(exported.contains("\"'@London\""));
        org.junit.jupiter.api.Assertions.assertTrue(exported.contains("\"'-Paris\""));
    }

    @Test
    @DisplayName("15. Multiple sheets in XLSX returns sheet names list")
    void multipleSheets_returnsSheetList() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            XSSFSheet s1 = wb.createSheet("Q1 Travel");
            Row h1 = s1.createRow(0);
            h1.createCell(0).setCellValue("Employee ID");
            h1.createCell(1).setCellValue("Travel Date");
            Row r1 = s1.createRow(1);
            r1.createCell(0).setCellValue("EMP001");
            r1.createCell(1).setCellValue("2026-01-15");

            XSSFSheet s2 = wb.createSheet("Q2 Travel");
            Row h2 = s2.createRow(0);
            h2.createCell(0).setCellValue("Employee ID");
            h2.createCell(1).setCellValue("Travel Date");

            wb.write(bos);
            byte[] multiSheetXlsx = bos.toByteArray();

            MockMultipartFile file = new MockMultipartFile("file", "multi.xlsx", "application/octet-stream", multiSheetXlsx);

            mockMvc.perform(multipart("/api/imports/upload").file(file).header("Authorization", tokenTravelDeskA))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.sheetNames", hasItems("Q1 Travel", "Q2 Travel")));
        }
    }

    @Test
    @DisplayName("16. User without company tenant context returns 400 Bad Request with actionable message")
    void upload_userWithoutCompany_returns400ActionableMessage() throws Exception {
        User userWithoutCompany = new User();
        userWithoutCompany.setUsername("homeless_admin");
        userWithoutCompany.setPassword(passwordEncoder.encode("secret"));
        userWithoutCompany.setRole(Role.ADMIN);
        userWithoutCompany.setCompany(null);
        userRepository.save(userWithoutCompany);

        String tokenNoCompany = "Bearer " + jwtService.generateToken(userWithoutCompany);

        MockMultipartFile file = new MockMultipartFile(
                "file", "trips.csv", "text/csv", "Employee ID\nEMP001\n".getBytes(StandardCharsets.UTF_8)
        );

        mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenNoCompany))
                .andExpect(status().isBadRequest())
                .andExpect(status().reason(containsString("User account is not associated with an active company tenant.")));
    }

    @Test
    @DisplayName("17. Airline GDS slash name notation and Pax Name column are properly parsed and matched")
    void upload_airlineGdsSlashFormat_normalizesAndMatchesEmployee() throws Exception {
        // PAX NAME in airline notation "WALKER/ALICE MS" without explicit employee ID column
        String csvContent = "PAX NAME,Travel Date,Origin,Destination,Ticket Number,Fare\n" +
                "WALKER/ALICE MS,2026-08-15,New York,London,BA-9901,1450.00\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "airline_gds.csv", "text/csv", csvContent.getBytes(StandardCharsets.UTF_8)
        );

        org.springframework.test.web.servlet.MvcResult result = mockMvc.perform(multipart("/api/imports/upload")
                        .file(file)
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PREVIEW"))
                .andExpect(jsonPath("$.totalRows").value(1))
                .andExpect(jsonPath("$.validRows").value(1))
                .andReturn();

        Number batchId = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id");

        // Fetch records
        mockMvc.perform(get("/api/imports/" + batchId + "/records")
                        .header("Authorization", tokenTravelDeskA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].rawEmployeeName").value("Alice Walker"))
                .andExpect(jsonPath("$.content[0].matchedEmployeeName").value("Alice Walker"))
                .andExpect(jsonPath("$.content[0].matchedEmployeeCode").value("EMP001"))
                .andExpect(jsonPath("$.content[0].status").value("MATCHED"));
    }

    @Test
    @DisplayName("18. Title banner on Row 0 is skipped and real table headers with Sector on Row 1 are extracted")
    void upload_titleBannerAtRowZero_skipsBannerAndExtractsHeadersWithSector() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            XSSFSheet sheet = wb.createSheet("AIR TICKETING");
            // Row 0: Title banner (single cell with text)
            Row r0 = sheet.createRow(0);
            r0.createCell(0).setCellValue("AIR TICKETS");

            // Row 1: Real table headers
            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("Date");
            r1.createCell(1).setCellValue("Pax Name");
            r1.createCell(2).setCellValue("Sector");
            r1.createCell(3).setCellValue("Ticket No");
            r1.createCell(4).setCellValue("Net Amount");

            // Row 2: Data row
            Row r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("15-Sep-2026");
            r2.createCell(1).setCellValue("Alice Walker");
            r2.createCell(2).setCellValue("HYD-DEL");
            r2.createCell(3).setCellValue("6E-502");
            r2.createCell(4).setCellValue(6800.0);

            wb.write(bos);
            byte[] bytes = bos.toByteArray();

            MockMultipartFile file = new MockMultipartFile(
                    "file", "MISPL_SEP_2026.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes
            );

            org.springframework.test.web.servlet.MvcResult result = mockMvc.perform(multipart("/api/imports/upload")
                            .file(file)
                            .header("Authorization", tokenTravelDeskA))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("PREVIEW"))
                    .andExpect(jsonPath("$.totalRows").value(1))
                    .andExpect(jsonPath("$.validRows").value(1))
                    .andExpect(jsonPath("$.errorRows").value(0))
                    .andReturn();

            Number batchId = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id");

            mockMvc.perform(get("/api/imports/" + batchId + "/records")
                            .header("Authorization", tokenTravelDeskA))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[0].rawEmployeeName").value("Alice Walker"))
                    .andExpect(jsonPath("$.content[0].fromLocation").value("HYD"))
                    .andExpect(jsonPath("$.content[0].toLocation").value("DEL"))
                    .andExpect(jsonPath("$.content[0].ticketReference").value("6E-502"))
                    .andExpect(jsonPath("$.content[0].cost").value(6800.0))
                    .andExpect(jsonPath("$.content[0].status").value("MATCHED"));
        }
    }
}
