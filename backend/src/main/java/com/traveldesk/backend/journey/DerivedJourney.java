package com.traveldesk.backend.journey;

import com.traveldesk.backend.company.Company;
import com.traveldesk.backend.employee.Employee;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "derived_journeys", uniqueConstraints = {
    @UniqueConstraint(name = "uk_journeys_company_uid", columnNames = {"company_id", "journey_uid"})
})
public class DerivedJourney {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(name = "journey_uid", length = 100, nullable = false)
    private String journeyUid;

    @Column(name = "primary_pnr", length = 100)
    private String primaryPnr;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(name = "passenger_name", length = 500, nullable = false)
    private String passengerName;

    @Column(name = "journey_type", length = 30, nullable = false)
    private String journeyType = "ONE_WAY"; // ONE_WAY, ROUND_TRIP, MULTI_CITY

    @Column(nullable = false)
    private String origin;

    @Column(nullable = false)
    private String destination;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "total_legs", nullable = false)
    private int totalLegs = 1;

    @Column(name = "gross_spend", nullable = false)
    private BigDecimal grossSpend = BigDecimal.ZERO;

    @Column(name = "total_refunds", nullable = false)
    private BigDecimal totalRefunds = BigDecimal.ZERO;

    @Column(name = "net_spend", nullable = false)
    private BigDecimal netSpend = BigDecimal.ZERO;

    @Column(length = 10)
    private String currency = "INR";

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

    public DerivedJourney() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public String getJourneyUid() { return journeyUid; }
    public void setJourneyUid(String journeyUid) { this.journeyUid = journeyUid; }

    public String getPrimaryPnr() { return primaryPnr; }
    public void setPrimaryPnr(String primaryPnr) { this.primaryPnr = primaryPnr; }

    public Employee getEmployee() { return employee; }
    public void setEmployee(Employee employee) { this.employee = employee; }

    public String getPassengerName() { return passengerName; }
    public void setPassengerName(String passengerName) { this.passengerName = passengerName; }

    public String getJourneyType() { return journeyType; }
    public void setJourneyType(String journeyType) { this.journeyType = journeyType; }

    public String getOrigin() { return origin; }
    public void setOrigin(String origin) { this.origin = origin; }

    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public int getTotalLegs() { return totalLegs; }
    public void setTotalLegs(int totalLegs) { this.totalLegs = totalLegs; }

    public BigDecimal getGrossSpend() { return grossSpend; }
    public void setGrossSpend(BigDecimal grossSpend) { this.grossSpend = grossSpend; }

    public BigDecimal getTotalRefunds() { return totalRefunds; }
    public void setTotalRefunds(BigDecimal totalRefunds) { this.totalRefunds = totalRefunds; }

    public BigDecimal getNetSpend() { return netSpend; }
    public void setNetSpend(BigDecimal netSpend) { this.netSpend = netSpend; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

