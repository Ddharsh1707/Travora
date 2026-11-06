package com.traveldesk.backend.project;

import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.importdata.ImportedTravelRecord;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "travel_record_project_allocations")
public class TravelRecordProjectAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_travel_record_id", nullable = false)
    private ImportedTravelRecord importedTravelRecord;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "allocated_amount", nullable = false)
    private BigDecimal allocatedAmount;

    @Column(length = 10)
    private String currency = "INR";

    @Column(name = "allocation_source", length = 50)
    private String allocationSource = "SPREADSHEET_MATRIX";

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (updatedAt == null) updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public TravelRecordProjectAllocation() {}

    public TravelRecordProjectAllocation(Company company, ImportedTravelRecord importedTravelRecord, Project project, BigDecimal allocatedAmount, String allocationSource) {
        this.company = company;
        this.importedTravelRecord = importedTravelRecord;
        this.project = project;
        this.allocatedAmount = allocatedAmount;
        if (allocationSource != null) this.allocationSource = allocationSource;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public ImportedTravelRecord getImportedTravelRecord() { return importedTravelRecord; }
    public void setImportedTravelRecord(ImportedTravelRecord importedTravelRecord) { this.importedTravelRecord = importedTravelRecord; }

    public Project getProject() { return project; }
    public void setProject(Project project) { this.project = project; }

    public BigDecimal getAllocatedAmount() { return allocatedAmount; }
    public void setAllocatedAmount(BigDecimal allocatedAmount) { this.allocatedAmount = allocatedAmount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getAllocationSource() { return allocationSource; }
    public void setAllocationSource(String allocationSource) { this.allocationSource = allocationSource; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

