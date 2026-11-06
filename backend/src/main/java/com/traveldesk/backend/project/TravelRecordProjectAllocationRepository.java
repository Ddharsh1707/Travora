package com.traveldesk.backend.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TravelRecordProjectAllocationRepository extends JpaRepository<TravelRecordProjectAllocation, Long> {

    List<TravelRecordProjectAllocation> findByCompanyIdAndImportedTravelRecordId(Long companyId, Long recordId);

    List<TravelRecordProjectAllocation> findByCompanyIdAndProjectId(Long companyId, Long projectId);

    void deleteByImportedTravelRecordId(Long recordId);

    @Query("SELECT a FROM TravelRecordProjectAllocation a WHERE a.company.id = :companyId AND a.importedTravelRecord.id IN :recordIds")
    List<TravelRecordProjectAllocation> findByCompanyIdAndRecordIdIn(
            @Param("companyId") Long companyId,
            @Param("recordIds") List<Long> recordIds
    );
}

