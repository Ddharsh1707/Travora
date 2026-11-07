package com.traveldesk.backend.ai.controller;

import com.traveldesk.backend.ai.dto.*;
import com.traveldesk.backend.ai.entity.AIConversation;
import com.traveldesk.backend.ai.entity.AIMessage;
import com.traveldesk.backend.ai.exception.AIServiceException;
import com.traveldesk.backend.ai.provider.AIProvider;
import com.traveldesk.backend.ai.provider.AIProviderFactory;
import com.traveldesk.backend.ai.service.AIConversationService;
import com.traveldesk.backend.ai.service.AIHealthService;
import com.traveldesk.backend.ai.service.AIOrchestratorService;
import com.traveldesk.backend.ai.service.AIUsageService;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.auth.UserRepository;
import com.traveldesk.backend.company.Company;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/ai")
public class AIChatController {

    private final AIConversationService conversationService;
    private final AIUsageService usageService;
    private final AIProviderFactory providerFactory;
    private final AIHealthService healthService;
    private final AIOrchestratorService orchestratorService;
    private final UserRepository userRepository;

    public AIChatController(
            AIConversationService conversationService,
            AIUsageService usageService,
            AIProviderFactory providerFactory,
            AIHealthService healthService,
            AIOrchestratorService orchestratorService,
            UserRepository userRepository
    ) {
        this.conversationService = conversationService;
        this.usageService = usageService;
        this.providerFactory = providerFactory;
        this.healthService = healthService;
        this.orchestratorService = orchestratorService;
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

    private Company getRequiredCompany(User user) {
        if (user.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not associated with an active company.");
        }
        return user.getCompany();
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> getAIHealth() {
        return ResponseEntity.ok(healthService.getHealthStatus());
    }

    @GetMapping("/conversations")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<Page<AIConversationResponse>> getConversations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        return ResponseEntity.ok(conversationService.getConversations(company, user, pageable));
    }

    @GetMapping("/conversations/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<List<AIMessageResponse>> getConversationMessages(@PathVariable Long id) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);
        return ResponseEntity.ok(conversationService.getMessages(id, company, user));
    }

    @PatchMapping("/conversations/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<AIConversationResponse> renameConversation(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);
        String newTitle = body.get("title");
        AIConversation conv = conversationService.renameConversation(id, company, user, newTitle);
        return ResponseEntity.ok(AIConversationResponse.from(conv, 0));
    }

    @DeleteMapping("/conversations/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<Void> deleteConversation(@PathVariable Long id) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);
        conversationService.deleteConversation(id, company, user);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/feedback")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<Map<String, String>> recordFeedback(@Valid @RequestBody AIFeedbackRequest request) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);
        conversationService.recordFeedback(request.messageId(), company, user, request.rating(), request.feedbackText());
        return ResponseEntity.ok(Map.of("status", "SUCCESS", "message", "Feedback recorded"));
    }

    @PostMapping("/chat")
    @PreAuthorize("hasAnyRole('ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN', 'TRAVEL_DESK', 'APPROVER', 'EMPLOYEE')")
    public ResponseEntity<AIChatResponse> chat(@Valid @RequestBody AIChatRequest request) {
        User user = getAuthenticatedUser();
        Company company = getRequiredCompany(user);

        // Resolve or create conversation
        AIConversation conversation;
        if (request.getConversationId() != null) {
            conversation = conversationService.getRequiredConversation(request.getConversationId(), company, user);
        } else {
            conversation = conversationService.createConversation(company, user, request.getMessage());
        }

        AIChatResponse clientResponse = orchestratorService.processChat(
                company,
                user,
                conversation,
                request.getMessage(),
                request.getClientContext()
        );

        return ResponseEntity.ok(clientResponse);
    }
}
