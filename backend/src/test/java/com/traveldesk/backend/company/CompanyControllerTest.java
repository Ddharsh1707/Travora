package com.traveldesk.backend.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.auth.JwtService;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class CompanyControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CompanyRepository companyRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private com.traveldesk.backend.employee.EmployeeRepository employeeRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        userRepository.findByUsername("acme_reg_admin").ifPresent(userRepository::delete);
        userRepository.findByUsername("another_reg_admin").ifPresent(userRepository::delete);
        userRepository.findByUsername("tech_lead").ifPresent(userRepository::delete);
        companyRepository.findByCodeIgnoreCase("ACME_REG").ifPresent(c -> {
            employeeRepository.deleteAll(employeeRepository.findByCompanyId(c.getId()));
            companyRepository.delete(c);
        });
        companyRepository.findByCodeIgnoreCase("TECH").ifPresent(c -> {
            employeeRepository.deleteAll(employeeRepository.findByCompanyId(c.getId()));
            companyRepository.delete(c);
        });
    }

    @Test
    @DisplayName("SaaS Onboarding: New company registers successfully with Company Admin")
    void shouldRegisterNewCompany() throws Exception {
        CompanyRegistrationRequest req = new CompanyRegistrationRequest();
        req.setName("Acme Corporation");
        req.setCode("ACME_REG");
        req.setDomain("acme.com");
        req.setAdminUsername("acme_reg_admin");
        req.setAdminPassword("Password123!");
        req.setAdminEmail("admin@acme.com");

        mockMvc.perform(post("/api/companies/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name", is("Acme Corporation")))
                .andExpect(jsonPath("$.code", is("ACME_REG")))
                .andExpect(jsonPath("$.domain", is("acme.com")))
                .andExpect(jsonPath("$.active", is(true)));
    }

    @Test
    @DisplayName("SaaS Onboarding: Duplicate company code returns 409 Conflict")
    void shouldRejectDuplicateCompanyCode() throws Exception {
        Company existing = new Company("Existing Corp", "ACME_REG", "existing.com");
        companyRepository.save(existing);

        CompanyRegistrationRequest req = new CompanyRegistrationRequest();
        req.setName("Another Acme Corp");
        req.setCode("acme_reg");
        req.setDomain("anotheracme.com");
        req.setAdminUsername("another_reg_admin");
        req.setAdminPassword("Password123!");

        mockMvc.perform(post("/api/companies/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Current Company: Authenticated user retrieves tenant company profile")
    void shouldReturnCurrentCompanyProfile() throws Exception {
        Company comp = companyRepository.save(new Company("Tech Solutions", "TECH", "tech.com"));

        User user = new User();
        user.setUsername("tech_lead");
        user.setPassword(passwordEncoder.encode("Pass123!"));
        user.setRole(Role.EMPLOYEE);
        user.setActive(true);
        user.setCompany(comp);
        userRepository.save(user);

        String token = jwtService.generateToken(user);

        mockMvc.perform(get("/api/companies/current")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("Tech Solutions")))
                .andExpect(jsonPath("$.code", is("TECH")));
    }
}
