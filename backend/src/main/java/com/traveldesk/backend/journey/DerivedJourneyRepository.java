package com.traveldesk.backend.journey;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface DerivedJourneyRepository extends JpaRepository<DerivedJourney, Long> {

    Optional<DerivedJourney> findByCompanyIdAndJourneyUid(Long companyId, String journeyUid);

    List<DerivedJourney> findByCompanyIdAndEmployeeId(Long companyId, Long employeeId);

    @Query("SELECT j FROM DerivedJourney j WHERE j.company.id = :companyId " +
           "AND (:search IS NULL OR LOWER(j.passengerName) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(j.origin) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(j.destination) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(j.primaryPnr) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "AND (:fromDate IS NULL OR j.startDate >= :fromDate) " +
           "AND (:toDate IS NULL OR j.startDate <= :toDate)")
    Page<DerivedJourney> searchJourneys(
            @Param("companyId") Long companyId,
            @Param("search") String search,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            Pageable pageable
    );
}

