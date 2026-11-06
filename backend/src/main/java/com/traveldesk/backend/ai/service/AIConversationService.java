package com.traveldesk.backend.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.traveldesk.backend.ai.dto.AIConversationResponse;
import com.traveldesk.backend.ai.dto.AIMessageResponse;
import com.traveldesk.backend.ai.entity.AIConversation;
import com.traveldesk.backend.ai.entity.AIFeedback;
import com.traveldesk.backend.ai.entity.AIMessage;
import com.traveldesk.backend.ai.exception.AIServiceException;
import com.traveldesk.backend.ai.repository.AIConversationRepository;
import com.traveldesk.backend.ai.repository.AIFeedbackRepository;
import com.traveldesk.backend.ai.repository.AIMessageRepository;
import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AIConversationService {

    private final AIConversationRepository conversationRepository;
    private final AIMessageRepository messageRepository;
    private final AIFeedbackRepository feedbackRepository;
    private final ObjectMapper objectMapper;

    public AIConversationService(
            AIConversationRepository conversationRepository,
            AIMessageRepository messageRepository,
            AIFeedbackRepository feedbackRepository,
            @org.springframework.beans.factory.annotation.Autowired(required = false) ObjectMapper objectMapper
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.feedbackRepository = feedbackRepository;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Transactional(readOnly = true)
    public Page<AIConversationResponse> getConversations(Company company, User user, Pageable pageable) {
        return conversationRepository
                .findByCompanyIdAndUserIdAndIsDeletedFalseOrderByUpdatedAtDesc(company.getId(), user.getId(), pageable)
                .map(conv -> {
                    long count = messageRepository.countByConversationId(conv.getId());
                    return AIConversationResponse.from(conv, count);
                });
    }

    @Transactional(readOnly = true)
    public AIConversation getRequiredConversation(Long conversationId, Company company, User user) {
        return conversationRepository
                .findByIdAndCompanyIdAndUserIdAndIsDeletedFalse(conversationId, company.getId(), user.getId())
                .orElseThrow(() -> new AIServiceException(
                        "Conversation not found or access denied (ID: " + conversationId + ")",
                        "CONVERSATION_NOT_FOUND",
                        false
                ));
    }

    @Transactional(readOnly = true)
    public List<AIMessageResponse> getMessages(Long conversationId, Company company, User user) {
        // Enforce ownership
        getRequiredConversation(conversationId, company, user);
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                .map(AIMessageResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public AIConversation createConversation(Company company, User user, String initialPrompt) {
        String title = generateTitleFromPrompt(initialPrompt);
        String roleStr = user.getRole() != null ? user.getRole().name() : "EMPLOYEE";
        AIConversation conv = new AIConversation(company, user, title, roleStr);
        return conversationRepository.save(conv);
    }

    @Transactional
    public AIConversation renameConversation(Long conversationId, Company company, User user, String newTitle) {
        AIConversation conv = getRequiredConversation(conversationId, company, user);
        if (newTitle != null && !newTitle.isBlank()) {
            conv.setTitle(newTitle.trim());
            conv.setUpdatedAt(LocalDateTime.now());
            return conversationRepository.save(conv);
        }
        return conv;
    }

    @Transactional
    public void deleteConversation(Long conversationId, Company company, User user) {
        AIConversation conv = getRequiredConversation(conversationId, company, user);
        conv.setDeleted(true);
        conv.setUpdatedAt(LocalDateTime.now());
        conversationRepository.save(conv);
    }

    @Transactional
    public AIMessage appendMessage(
            AIConversation conversation,
            String senderType,
            String content,
            Object structuredData,
            Object toolCalls,
            long tokensIn,
            long tokensOut,
            String model,
            String provider
    ) {
        AIMessage msg = new AIMessage(conversation, senderType, content);
        msg.setTokensIn(tokensIn);
        msg.setTokensOut(tokensOut);
        msg.setModel(model);
        msg.setProvider(provider);

        if (structuredData != null) {
            try {
                msg.setStructuredData(objectMapper.writeValueAsString(structuredData));
            } catch (Exception e) {
                msg.setStructuredData(String.valueOf(structuredData));
            }
        }

        if (toolCalls != null) {
            try {
                msg.setToolCalls(objectMapper.writeValueAsString(toolCalls));
            } catch (Exception e) {
                msg.setToolCalls(String.valueOf(toolCalls));
            }
        }

        conversation.setUpdatedAt(LocalDateTime.now());
        conversationRepository.save(conversation);

        return messageRepository.save(msg);
    }

    @Transactional
    public void recordFeedback(Long messageId, Company company, User user, String rating, String text) {
        AIMessage msg = messageRepository.findById(messageId).orElseThrow(() ->
                new AIServiceException("Message not found (ID: " + messageId + ")", "MESSAGE_NOT_FOUND", false));

        // Enforce conversation company isolation
        if (!msg.getConversation().getCompany().getId().equals(company.getId())) {
            throw new AIServiceException("Access denied to record feedback", "FORBIDDEN", false);
        }

        AIFeedback feedback = new AIFeedback(msg, user, rating, text);
        feedbackRepository.save(feedback);
    }

    private String generateTitleFromPrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return "New Travel Query";
        }
        String clean = prompt.replaceAll("[\\r\\n]+", " ").trim();
        if (clean.length() > 50) {
            return clean.substring(0, 47) + "…";
        }
        return clean;
    }
}

