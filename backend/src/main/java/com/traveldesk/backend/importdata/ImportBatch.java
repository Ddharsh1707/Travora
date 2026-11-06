package com.traveldesk.backend.importdata;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "import_batches")
public class ImportBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "uploaded_by_id")
    private User uploadedBy;

    @Column(nullable = false)
    private String filename;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "file_type", nullable = false)
    private String fileType; // XLSX, CSV

    @Column(name = "sheet_name")
    private String sheetName;

    @Column(name = "import_type", nullable = false)
    private String importType = "TRAVEL_HISTORY";

    @Column(nullable = false)
    private String status = "PREVIEW"; // PREVIEW, IMPORTING, COMPLETED, FAILED, EXPIRED

    @Column(name = "total_rows", nullable = false)
    private Integer totalRows = 0;

    @Column(name = "valid_rows", nullable = false)
    private Integer validRows = 0;

    @Column(name = "imported_rows", nullable = false)
    private Integer importedRows = 0;

    @Column(name = "skipped_rows", nullable = false)
    private Integer skippedRows = 0;

    @Column(name = "error_rows", nullable = false)
    private Integer errorRows = 0;

    @Column(name = "column_mapping", columnDefinition = "TEXT")
    private String columnMapping; // JSON string

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (expiresAt == null) {
            // Preview data expires after 24 hours
            expiresAt = createdAt.plusHours(24);
        }
    }

    public ImportBatch() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public User getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(User uploadedBy) { this.uploadedBy = uploadedBy; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    public String getOriginalFilename() { return originalFilename; }
    public void setOriginalFilename(String originalFilename) { this.originalFilename = originalFilename; }

    public String getFileType() { return fileType; }
    public void setFileType(String fileType) { this.fileType = fileType; }

    public String getSheetName() { return sheetName; }
    public void setSheetName(String sheetName) { this.sheetName = sheetName; }

    public String getImportType() { return importType; }
    public void setImportType(String importType) { this.importType = importType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getTotalRows() { return totalRows != null ? totalRows : 0; }
    public void setTotalRows(Integer totalRows) { this.totalRows = totalRows != null ? totalRows : 0; }

    public Integer getValidRows() { return validRows != null ? validRows : 0; }
    public void setValidRows(Integer validRows) { this.validRows = validRows != null ? validRows : 0; }

    public Integer getImportedRows() { return importedRows != null ? importedRows : 0; }
    public void setImportedRows(Integer importedRows) { this.importedRows = importedRows != null ? importedRows : 0; }

    public Integer getSkippedRows() { return skippedRows != null ? skippedRows : 0; }
    public void setSkippedRows(Integer skippedRows) { this.skippedRows = skippedRows != null ? skippedRows : 0; }

    public Integer getErrorRows() { return errorRows != null ? errorRows : 0; }
    public void setErrorRows(Integer errorRows) { this.errorRows = errorRows != null ? errorRows : 0; }

    public String getColumnMapping() { return columnMapping; }
    public void setColumnMapping(String columnMapping) { this.columnMapping = columnMapping; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
}
