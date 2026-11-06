package com.traveldesk.backend.employee;

import com.traveldesk.backend.company.Company;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "imported_passenger_aliases", uniqueConstraints = {
    @UniqueConstraint(name = "uk_passenger_alias_company_raw", columnNames = {"company_id", "raw_name_string"})
})
public class ImportedPassengerAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(name = "raw_name_string", length = 500, nullable = false)
    private String rawNameString;

    @Column(name = "normalized_name", length = 500, nullable = false)
    private String normalizedName;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(name = "match_rule", length = 50, nullable = false)
    private String matchRule = "MANUAL"; // EXACT, TOKEN_SIMILARITY, MANUAL, SOUNDEX

    @Column(length = 20, nullable = false)
    private String confidence = "HIGH"; // HIGH, MEDIUM, LOW, MANUAL

    @Column(name = "verified_by_user_id")
    private Long verifiedByUserId;

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

    public ImportedPassengerAlias() {}

    public ImportedPassengerAlias(Company company, String rawNameString, String normalizedName, Employee employee, String matchRule, String confidence) {
        this.company = company;
        this.rawNameString = rawNameString;
        this.normalizedName = normalizedName;
        this.employee = employee;
        if (matchRule != null) this.matchRule = matchRule;
        if (confidence != null) this.confidence = confidence;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public String getRawNameString() { return rawNameString; }
    public void setRawNameString(String rawNameString) { this.rawNameString = rawNameString; }

    public String getNormalizedName() { return normalizedName; }
    public void setNormalizedName(String normalizedName) { this.normalizedName = normalizedName; }

    public Employee getEmployee() { return employee; }
    public void setEmployee(Employee employee) { this.employee = employee; }

    public String getMatchRule() { return matchRule; }
    public void setMatchRule(String matchRule) { this.matchRule = matchRule; }

    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }

    public Long getVerifiedByUserId() { return verifiedByUserId; }
    public void setVerifiedByUserId(Long verifiedByUserId) { this.verifiedByUserId = verifiedByUserId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

