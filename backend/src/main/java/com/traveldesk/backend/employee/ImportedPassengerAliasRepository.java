package com.traveldesk.backend.employee;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ImportedPassengerAliasRepository extends JpaRepository<ImportedPassengerAlias, Long> {

    Optional<ImportedPassengerAlias> findByCompanyIdAndRawNameString(Long companyId, String rawNameString);

    List<ImportedPassengerAlias> findByCompanyIdAndEmployeeId(Long companyId, Long employeeId);

    List<ImportedPassengerAlias> findByCompanyIdOrderByNormalizedNameAsc(Long companyId);

    @Query("SELECT a FROM ImportedPassengerAlias a WHERE a.company.id = :companyId AND a.rawNameString IN :rawNames")
    List<ImportedPassengerAlias> findByCompanyIdAndRawNameStringIn(
            @Param("companyId") Long companyId,
            @Param("rawNames") List<String> rawNames
    );
}

