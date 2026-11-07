package com.traveldesk.backend.ai.repository;

import com.traveldesk.backend.ai.entity.AIUsageRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Repository
public interface AIUsageRecordRepository extends JpaRepository<AIUsageRecord, Long> {

    long countByCompanyIdAndUserIdAndCreatedAtAfter(
            Long companyId,
            Long userId,
            LocalDateTime after
    );

    @Query("SELECT COALESCE(SUM(u.estimatedCost), 0) FROM AIUsageRecord u WHERE u.company.id = :companyId AND u.createdAt >= :after")
    BigDecimal sumEstimatedCostByCompanyIdAndCreatedAtAfter(
            @Param("companyId") Long companyId,
            @Param("after") LocalDateTime after
    );

    @Query("SELECT COALESCE(SUM(u.tokensIn + u.tokensOut), 0) FROM AIUsageRecord u WHERE u.company.id = :companyId AND u.createdAt >= :after")
    long sumTokensByCompanyIdAndCreatedAtAfter(
            @Param("companyId") Long companyId,
            @Param("after") LocalDateTime after
    );
}

