package com.traveldesk.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIChatRequest;
import com.traveldesk.backend.ai.dto.AIFeedbackRequest;
import com.traveldesk.backend.ai.entity.AIConversation;
import com.traveldesk.backend.ai.repository.AIConversationRepository;
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

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AIConversationIntegrationTest {

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
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Company companyA;
    private Company companyB;
    private User userA;
    private User userB;
    private String tokenA;
    private String tokenB;

    @Autowired
    private com.traveldesk.backend.ai.repository.AIFeedbackRepository feedbackRepository;

    @BeforeEach
    void setUp() {
        cleanup();

        companyA = companyRepository.findByCode("CMPA").orElseGet(() -> {
            Company c = new Company("Company Alpha", "CMPA", "alpha.com");
            return companyRepository.save(c);
        });

        companyB = companyRepository.findByCode("CMPB").orElseGet(() -> {
            Company c = new Company("Company Beta", "CMPB", "beta.com");
            return companyRepository.save(c);
        });

        userA = userRepository.findByUsername("user_alpha").orElseGet(() -> {
            User u = new User();
            u.setUsername("user_alpha");
            u.setPassword(passwordEncoder.encode("password123"));
            u.setRole(Role.TRAVEL_DESK);
            u.setActive(true);
            u.setCompany(companyA);
            return userRepository.save(u);
        });

        userB = userRepository.findByUsername("user_beta").orElseGet(() -> {
            User u = new User();
            u.setUsername("user_beta");
            u.setPassword(passwordEncoder.encode("password123"));
            u.setRole(Role.EMPLOYEE);
            u.setActive(true);
            u.setCompany(companyB);
            return userRepository.save(u);
        });

        tokenA = jwtService.generateToken(userA);
        tokenB = jwtService.generateToken(userB);
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
    @DisplayName("POST /api/ai/chat initiates conversation and persists user and assistant messages")
    void testChatInitiationAndPersistence() throws Exception {
        AIChatRequest req = new AIChatRequest("What is our total spend on domestic flights?");

        String responseBody = mockMvc.perform(post("/api/ai/chat")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conversationId").isNumber())
                .andExpect(jsonPath("$.messageId").isNumber())
                .andExpect(jsonPath("$.answerText").isNotEmpty())
                .andExpect(jsonPath("$.usageMetadata.provider").value("mock"))
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> respMap = objectMapper.readValue(responseBody, Map.class);
        Long convId = ((Number) respMap.get("conversationId")).longValue();

        // Verify database persistence
        assertEquals(1, conversationRepository.count());
        assertEquals(2, messageRepository.count()); // 1 user + 1 assistant
        assertEquals(1, usageRepository.count());

        // Verify conversation listing
        mockMvc.perform(get("/api/ai/conversations")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id").value(convId))
                .andExpect(jsonPath("$.content[0].messageCount").value(2));

        // Verify message thread
        mockMvc.perform(get("/api/ai/conversations/" + convId)
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].senderType").value("USER"))
                .andExpect(jsonPath("$[1].senderType").value("ASSISTANT"));
    }

    @Test
    @DisplayName("PATCH /api/ai/conversations/{id} renames title and DELETE soft-deletes")
    void testRenameAndDeleteConversation() throws Exception {
        AIChatRequest req = new AIChatRequest("Initial flight inquiry");
        String responseBody = mockMvc.perform(post("/api/ai/chat")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> respMap = objectMapper.readValue(responseBody, Map.class);
        Long convId = ((Number) respMap.get("conversationId")).longValue();

        // Rename
        mockMvc.perform(patch("/api/ai/conversations/" + convId)
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Updated Travel Report Title"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated Travel Report Title"));

        // Delete
        mockMvc.perform(delete("/api/ai/conversations/" + convId)
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNoContent());

        // Should no longer appear in active list
        mockMvc.perform(get("/api/ai/conversations")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(0)));
    }

    @Test
    @DisplayName("Tenant Isolation: User B cannot access User A's conversation")
    void testTenantIsolationCrossCompany() throws Exception {
        // Manually create conversation belonging to User A (Company A)
        AIConversation convA = conversationRepository.save(
                new AIConversation(companyA, userA, "Secret Alpha Plan", "TRAVEL_DESK")
        );

        // User B from Company B attempts to read User A's conversation -> CONVERSATION_NOT_FOUND (500)
        mockMvc.perform(get("/api/ai/conversations/" + convA.getId())
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().is5xxServerError());

        // User B attempts to delete User A's conversation -> rejected
        mockMvc.perform(delete("/api/ai/conversations/" + convA.getId())
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().is5xxServerError());
    }

    @Test
    @DisplayName("POST /api/ai/feedback records rating on message")
    void testFeedbackSubmission() throws Exception {
        AIChatRequest req = new AIChatRequest("Explain travel budget");
        String responseBody = mockMvc.perform(post("/api/ai/chat")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        Map<String, Object> respMap = objectMapper.readValue(responseBody, Map.class);
        Long msgId = ((Number) respMap.get("messageId")).longValue();

        AIFeedbackRequest fbReq = new AIFeedbackRequest(msgId, "THUMBS_UP", "Very accurate answer.");
        mockMvc.perform(post("/api/ai/feedback")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(fbReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"));
    }
}
