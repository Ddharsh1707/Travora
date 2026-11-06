package com.traveldesk.backend.project;

import com.traveldesk.backend.company.Company;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "projects", uniqueConstraints = {
    @UniqueConstraint(name = "uk_projects_company_code", columnNames = {"company_id", "project_code"})
})
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(name = "project_code", nullable = false)
    private String projectCode;

    @Column(name = "project_name", nullable = false)
    private String projectName;

    @Column(name = "client_name")
    private String clientName;

    private String location;

    @Column(name = "budget_amount")
    private BigDecimal budgetAmount;

    @Column(name = "budget_currency")
    private String budgetCurrency = "INR";

    @Column(nullable = false)
    private String status = "ACTIVE"; // ACTIVE, COMPLETED, SUSPENDED

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

    public Project() {}

    public Project(Company company, String projectCode, String projectName, String clientName, String location, BigDecimal budgetAmount, String status) {
        this.company = company;
        this.projectCode = projectCode;
        this.projectName = projectName;
        this.clientName = clientName;
        this.location = location;
        this.budgetAmount = budgetAmount;
        if (status != null) this.status = status;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String projectCode) { this.projectCode = projectCode; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getClientName() { return clientName; }
    public void setClientName(String clientName) { this.clientName = clientName; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public BigDecimal getBudgetAmount() { return budgetAmount; }
    public void setBudgetAmount(BigDecimal budgetAmount) { this.budgetAmount = budgetAmount; }

    public String getBudgetCurrency() { return budgetCurrency; }
    public void setBudgetCurrency(String budgetCurrency) { this.budgetCurrency = budgetCurrency; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

