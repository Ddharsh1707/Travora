package com.traveldesk.backend.employee;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

    Optional<Employee> findByEmployeeId(String employeeId);

    List<Employee> findByCompanyId(Long companyId);

    Optional<Employee> findByCompanyIdAndEmployeeId(Long companyId, String employeeId);

    List<Employee> findByCompanyIdAndNameIgnoreCase(Long companyId, String name);

    boolean existsByEmployeeId(String employeeId);

    boolean existsByCompanyIdAndEmployeeId(Long companyId, String employeeId);

    Page<Employee> findByCompanyIdAndEmployeeId(Long companyId, String employeeId, Pageable pageable);

    @Query("SELECT e FROM Employee e WHERE e.company.id = :companyId " +
           "AND (cast(:active as Boolean) IS NULL OR e.active = :active) " +
           "AND (cast(:search as String) IS NULL OR cast(:search as String) = '' OR " +
           "LOWER(e.name) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(e.employeeId) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(e.department) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(COALESCE(e.email, '')) LIKE LOWER(CONCAT('%', cast(:search as String), '%')))")
    Page<Employee> searchEmployees(
            @Param("companyId") Long companyId,
            @Param("active") Boolean active,
            @Param("search") String search,
            Pageable pageable
    );

    @Query("SELECT e FROM Employee e WHERE (cast(:companyId as Long) IS NULL OR e.company.id = :companyId) " +
           "AND (cast(:active as Boolean) IS NULL OR e.active = :active) " +
           "AND (cast(:search as String) IS NULL OR cast(:search as String) = '' OR " +
           "LOWER(e.name) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(e.employeeId) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(e.department) LIKE LOWER(CONCAT('%', cast(:search as String), '%')) OR " +
           "LOWER(COALESCE(e.email, '')) LIKE LOWER(CONCAT('%', cast(:search as String), '%')))")
    Page<Employee> searchEmployeesPlatformAdmin(
            @Param("companyId") Long companyId,
            @Param("active") Boolean active,
            @Param("search") String search,
            Pageable pageable
    );
}
