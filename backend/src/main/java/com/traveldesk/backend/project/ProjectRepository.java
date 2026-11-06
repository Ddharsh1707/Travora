package com.traveldesk.backend.project;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {

    List<Project> findByCompanyIdOrderByProjectNameAsc(Long companyId);

    Optional<Project> findByCompanyIdAndProjectCodeIgnoreCase(Long companyId, String projectCode);

    Optional<Project> findByCompanyIdAndProjectNameIgnoreCase(Long companyId, String projectName);

    @Query("SELECT p FROM Project p WHERE p.company.id = :companyId " +
           "AND (:search IS NULL OR LOWER(p.projectName) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.projectCode) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.clientName) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "AND (:status IS NULL OR p.status = :status)")
    Page<Project> searchProjects(
            @Param("companyId") Long companyId,
            @Param("search") String search,
            @Param("status") String status,
            Pageable pageable
    );

    @Query("SELECT p FROM Project p WHERE p.company.id = :companyId " +
           "AND (LOWER(p.projectName) = LOWER(:name) OR LOWER(p.projectCode) = LOWER(:code))")
    Optional<Project> findByNameOrCode(
            @Param("companyId") Long companyId,
            @Param("name") String name,
            @Param("code") String code
    );
}

