package com.traveldesk.backend.ai.repository;

import com.traveldesk.backend.ai.entity.AIInsight;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AIInsightRepository extends JpaRepository<AIInsight, Long> {

    List<AIInsight> findByCompanyIdAndStatusOrderByCreatedAtDesc(Long companyId, String status);

    List<AIInsight> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
}

