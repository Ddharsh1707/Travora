package com.traveldesk.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIChatRequest;
import com.traveldesk.backend.ai.entity.AIConversation;
import com.traveldesk.backend.ai.repository.AIConversationRepository;
import com.traveldesk.backend.ai.repository.AIFeedbackRepository;
import com.traveldesk.backend.ai.repository.AIMessageRepository;
import com.traveldesk.backend.ai.repository.AIUsageRecordRepository;
import com.traveldesk.backend.auth.JwtService;
import com.traveldesk.backend.auth.Role;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.company.CompanyRepository;
import org.junit.jupiter.api.AfterEach;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AIOrchestratorIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CompanyRepository companyRepository;

    @Autowired
    private AIConversationRepository conversationRepository;

    @Autowired
    private AIMessageRepository messageRepository;

    @Autowired
    private AIUsageRecordRepository usageRepository;

    @Autowired
    private AIFeedbackRepository feedbackRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Company testCompany;
    private User adminUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        cleanup();

        testCompany = companyRepository.findByCode("ORCH_CMP").orElseGet(() -> {
            Company c = new Company("Orchestrator Corp", "ORCH_CMP", "orch.com");
            return companyRepository.save(c);
        });

        adminUser = userRepository.findByUsername("orch_admin").orElseGet(() -> {
            User u = new User();
            u.setUsername("orch_admin");
            u.setPassword(passwordEncoder.encode("secretPass123"));
            u.setRole(Role.ADMIN);
            u.setActive(true);
            u.setCompany(testCompany);
            return userRepository.save(u);
        });

        adminToken = jwtService.generateToken(adminUser);
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    private void cleanup() {
        feedbackRepository.deleteAll();
        messageRepository.deleteAll();
        usageRepository.deleteAll();
        conversationRepository.deleteAll();
    }

    @Test
    @DisplayName("End-to-end chat orchestration executes tool calling loop and synthesizes response")
    void testChatOrchestrationWithToolExecution() throws Exception {
        AIChatRequest request = new AIChatRequest(null, "Please give me an overview of our travel spend this year.");

        mockMvc.perform(post("/api/ai/chat")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conversationId").isNumber())
                .andExpect(jsonPath("$.messageId").isNumber())
                .andExpect(jsonPath("$.answerText").value(containsString("Verified company travel ledger records")))
                .andExpect(jsonPath("$.calculationBasis").value(containsString("Decision 3")))
                .andExpect(jsonPath("$.usageMetadata.totalTokens").isNumber());
    }

    @Test
    @DisplayName("Chat handles regular non-tool query cleanly")
    void testChatWithoutToolCalling() throws Exception {
        AIChatRequest request = new AIChatRequest(null, "Hello Trapple AI, who are you?");

        mockMvc.perform(post("/api/ai/chat")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answerText").value(containsString("Trapple AI Assistant")));
    }
}

