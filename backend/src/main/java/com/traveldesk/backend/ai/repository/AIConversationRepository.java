package com.traveldesk.backend.ai.repository;

import com.traveldesk.backend.ai.entity.AIConversation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AIConversationRepository extends JpaRepository<AIConversation, Long> {

    Page<AIConversation> findByCompanyIdAndUserIdAndIsDeletedFalseOrderByUpdatedAtDesc(
            Long companyId,
            Long userId,
            Pageable pageable
    );

    Optional<AIConversation> findByIdAndCompanyIdAndUserIdAndIsDeletedFalse(
            Long id,
            Long companyId,
            Long userId
    );

    Optional<AIConversation> findByIdAndCompanyIdAndIsDeletedFalse(
            Long id,
            Long companyId
    );
}

