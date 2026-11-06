package com.traveldesk.backend.ai.repository;

import com.traveldesk.backend.ai.entity.AIFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AIFeedbackRepository extends JpaRepository<AIFeedback, Long> {

    List<AIFeedback> findByMessageId(Long messageId);
}

