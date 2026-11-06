package com.traveldesk.backend.importdata;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface ImportedTravelRecordRepository extends JpaRepository<ImportedTravelRecord, Long> {

    Page<ImportedTravelRecord> findByImportBatchId(Long importBatchId, Pageable pageable);

    Page<ImportedTravelRecord> findByImportBatchIdAndStatus(Long importBatchId, String status, Pageable pageable);

    List<ImportedTravelRecord> findByImportBatchId(Long importBatchId);

    List<ImportedTravelRecord> findByImportBatchIdAndImported(Long importBatchId, boolean imported);

    List<ImportedTravelRecord> findByCompanyIdAndImported(Long companyId, boolean imported);

    List<ImportedTravelRecord> findByCompanyId(Long companyId);

    long countByImportBatchIdAndStatus(Long importBatchId, String status);

    void deleteByImportBatchId(Long importBatchId);

    // Search imported travel history (only imported=true)
    @Query("SELECT r FROM ImportedTravelRecord r LEFT JOIN r.employee emp WHERE r.company.id = :companyId AND r.imported = true " +
           "AND (:search IS NULL OR :search = '' OR " +
           "LOWER(r.rawEmployeeName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.rawEmployeeIdentifier) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "(emp IS NOT NULL AND LOWER(emp.name) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "(emp IS NOT NULL AND LOWER(emp.employeeId) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "LOWER(r.fromLocation) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.toLocation) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.department) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "(emp IS NOT NULL AND LOWER(emp.department) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "LOWER(r.ticketReference) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.projectName) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<ImportedTravelRecord> searchTravelHistory(
            @Param("companyId") Long companyId,
            @Param("search") String search,
            Pageable pageable);

    // Search imported travel history with date range and employee filter
    @Query("SELECT r FROM ImportedTravelRecord r LEFT JOIN r.employee emp WHERE r.company.id = :companyId AND r.imported = true " +
           "AND (cast(:employeeId as Long) IS NULL OR (r.employee IS NOT NULL AND r.employee.id = :employeeId)) " +
           "AND (cast(:fromDate as LocalDate) IS NULL OR r.travelDate >= :fromDate) " +
           "AND (cast(:toDate as LocalDate) IS NULL OR r.travelDate <= :toDate) " +
           "AND (cast(:searchPattern as String) IS NULL OR " +
           "LOWER(r.rawEmployeeName) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.rawEmployeeIdentifier) LIKE cast(:searchPattern as String) OR " +
           "(emp IS NOT NULL AND LOWER(emp.name) LIKE cast(:searchPattern as String)) OR " +
           "(emp IS NOT NULL AND LOWER(emp.employeeId) LIKE cast(:searchPattern as String)) OR " +
           "LOWER(r.fromLocation) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.toLocation) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.department) LIKE cast(:searchPattern as String) OR " +
           "(emp IS NOT NULL AND LOWER(emp.department) LIKE cast(:searchPattern as String)) OR " +
           "LOWER(r.ticketReference) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.projectName) LIKE cast(:searchPattern as String))")
    Page<ImportedTravelRecord> searchTravelHistoryFiltered(
            @Param("companyId") Long companyId,
            @Param("employeeId") Long employeeId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("searchPattern") String searchPattern,
            Pageable pageable);

    // List for export
    @Query("SELECT r FROM ImportedTravelRecord r LEFT JOIN r.employee emp WHERE r.company.id = :companyId AND r.imported = true " +
           "AND (cast(:employeeId as Long) IS NULL OR (r.employee IS NOT NULL AND r.employee.id = :employeeId)) " +
           "AND (cast(:fromDate as LocalDate) IS NULL OR r.travelDate >= :fromDate) " +
           "AND (cast(:toDate as LocalDate) IS NULL OR r.travelDate <= :toDate) " +
           "AND (cast(:searchPattern as String) IS NULL OR " +
           "LOWER(r.rawEmployeeName) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.rawEmployeeIdentifier) LIKE cast(:searchPattern as String) OR " +
           "(emp IS NOT NULL AND LOWER(emp.name) LIKE cast(:searchPattern as String)) OR " +
           "(emp IS NOT NULL AND LOWER(emp.employeeId) LIKE cast(:searchPattern as String)) OR " +
           "LOWER(r.fromLocation) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.toLocation) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.department) LIKE cast(:searchPattern as String) OR " +
           "(emp IS NOT NULL AND LOWER(emp.department) LIKE cast(:searchPattern as String)) OR " +
           "LOWER(r.ticketReference) LIKE cast(:searchPattern as String) OR " +
           "LOWER(r.projectName) LIKE cast(:searchPattern as String)) " +
           "ORDER BY r.travelDate DESC NULLS LAST, r.id DESC")
    List<ImportedTravelRecord> findForExport(
            @Param("companyId") Long companyId,
            @Param("employeeId") Long employeeId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("searchPattern") String searchPattern);

    // Duplicate detection against existing imported records
    @Query("SELECT r FROM ImportedTravelRecord r WHERE r.company.id = :companyId AND r.imported = true " +
           "AND r.rawEmployeeIdentifier = :empId AND r.travelDate = :travelDate " +
           "AND LOWER(r.fromLocation) = LOWER(:fromLoc) AND LOWER(r.toLocation) = LOWER(:toLoc)")
    List<ImportedTravelRecord> findExistingDuplicates(
            @Param("companyId") Long companyId,
            @Param("empId") String empId,
            @Param("travelDate") LocalDate travelDate,
            @Param("fromLoc") String fromLoc,
            @Param("toLoc") String toLoc);

    // Filtered historical records for spend intelligence analytics & aggregation
    @Query("SELECT r FROM ImportedTravelRecord r LEFT JOIN r.employee emp WHERE r.company.id = :companyId AND r.imported = true " +
           "AND (:employeeIdentifier IS NULL OR :employeeIdentifier = '' OR " +
           "LOWER(TRIM(r.rawEmployeeIdentifier)) = LOWER(TRIM(:employeeIdentifier)) OR " +
           "(emp IS NOT NULL AND LOWER(TRIM(emp.employeeId)) = LOWER(TRIM(:employeeIdentifier))) OR " +
           "LOWER(TRIM(r.rawEmployeeName)) = LOWER(TRIM(:employeeIdentifier)) OR " +
           "(emp IS NOT NULL AND LOWER(TRIM(emp.name)) = LOWER(TRIM(:employeeIdentifier)))) " +
           "AND (:department IS NULL OR :department = '' OR LOWER(r.department) = LOWER(:department) OR (emp IS NOT NULL AND LOWER(emp.department) = LOWER(:department))) " +
           "AND (:provider IS NULL OR :provider = '' OR LOWER(r.provider) = LOWER(:provider)) " +
           "AND (:travelMode IS NULL OR :travelMode = '' OR LOWER(r.travelMode) = LOWER(:travelMode)) " +
           "AND (:fromDate IS NULL OR r.travelDate >= :fromDate) " +
           "AND (:toDate IS NULL OR r.travelDate <= :toDate) " +
           "AND (:search IS NULL OR :search = '' OR " +
           "LOWER(r.rawEmployeeName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.rawEmployeeIdentifier) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "(emp IS NOT NULL AND LOWER(emp.name) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "(emp IS NOT NULL AND LOWER(emp.employeeId) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "LOWER(r.fromLocation) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.toLocation) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.department) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "(emp IS NOT NULL AND LOWER(emp.department) LIKE LOWER(CONCAT('%', :search, '%'))) OR " +
           "LOWER(r.ticketReference) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(r.projectName) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "ORDER BY r.travelDate DESC NULLS LAST, r.id DESC")
    List<ImportedTravelRecord> findFilteredForSpendAnalysis(
            @Param("companyId") Long companyId,
            @Param("employeeIdentifier") String employeeIdentifier,
            @Param("department") String department,
            @Param("provider") String provider,
            @Param("travelMode") String travelMode,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("search") String search);

    @Query("SELECT r FROM ImportedTravelRecord r LEFT JOIN r.employee emp WHERE r.company.id = :companyId AND r.imported = true " +
           "AND (" +
           "LOWER(TRIM(r.rawEmployeeIdentifier)) = LOWER(TRIM(:identifier)) " +
           "OR (emp IS NOT NULL AND LOWER(TRIM(emp.employeeId)) = LOWER(TRIM(:identifier))) " +
           "OR LOWER(TRIM(r.rawEmployeeName)) = LOWER(TRIM(:identifier)) " +
           "OR (emp IS NOT NULL AND LOWER(TRIM(emp.name)) = LOWER(TRIM(:identifier)))" +
           ") " +
           "ORDER BY r.travelDate ASC NULLS LAST, r.id ASC")
    List<ImportedTravelRecord> findByCompanyIdAndEmployeeIdentifier(
            @Param("companyId") Long companyId,
            @Param("identifier") String identifier);

    @Query("SELECT DISTINCT r.department FROM ImportedTravelRecord r WHERE r.company.id = :companyId AND r.imported = true AND r.department IS NOT NULL AND r.department != '' ORDER BY r.department ASC")
    List<String> findDistinctDepartmentsByCompanyId(@Param("companyId") Long companyId);

    @Query("SELECT DISTINCT r.provider FROM ImportedTravelRecord r WHERE r.company.id = :companyId AND r.imported = true AND r.provider IS NOT NULL AND r.provider != '' ORDER BY r.provider ASC")
    List<String> findDistinctProvidersByCompanyId(@Param("companyId") Long companyId);
}

