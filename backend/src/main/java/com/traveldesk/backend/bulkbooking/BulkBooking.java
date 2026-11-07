package com.traveldesk.backend.bulkbooking;

import com.traveldesk.backend.company.Company;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "bulk_bookings")
public class BulkBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "company_id")
    private Company company;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String destination;

    @Column(nullable = false)
    private String fromLocation;

    @Column(nullable = false)
    private String travelDates;

    private LocalDate departureDate;
    private LocalDate returnDate;

    @Column(nullable = false)
    private String travelMode;

    private String provider;

    @Column(nullable = false)
    private String groupReference;

    @Column(nullable = false)
    private Integer headcount = 1;

    @Column(nullable = false)
    private BigDecimal totalCost;

    @Column(nullable = false)
    private BigDecimal costPerPerson;

    private BigDecimal savings;
    private String project;
    private String departments;

    @Column(columnDefinition = "TEXT")
    private String passengerManifestSummary;

    @Column(columnDefinition = "TEXT")
    private String itineraryNotes;

    private String coordinatorName;

    @Column(nullable = false)
    private LocalDateTime loggedAt = LocalDateTime.now();

    @Column(nullable = false)
    private String status = "CONFIRMED";

    private String approverStatus = "PENDING_REVIEW";

    @Column(columnDefinition = "TEXT")
    private String approverComment;

    private LocalDateTime approverReviewedAt;

    private String attachmentName;

    @Column(columnDefinition = "TEXT")
    private String attachmentData;

    @OneToMany(mappedBy = "bulkBooking", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<BulkBookingPassenger> passengerList = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Company getCompany() {
        return company;
    }

    public void setCompany(Company company) {
        this.company = company;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDestination() {
        return destination;
    }

    public void setDestination(String destination) {
        this.destination = destination;
    }

    public String getFromLocation() {
        return fromLocation;
    }

    public void setFromLocation(String fromLocation) {
        this.fromLocation = fromLocation;
    }

    public String getTravelDates() {
        return travelDates;
    }

    public void setTravelDates(String travelDates) {
        this.travelDates = travelDates;
    }

    public LocalDate getDepartureDate() {
        return departureDate;
    }

    public void setDepartureDate(LocalDate departureDate) {
        this.departureDate = departureDate;
    }

    public LocalDate getReturnDate() {
        return returnDate;
    }

    public void setReturnDate(LocalDate returnDate) {
        this.returnDate = returnDate;
    }

    public String getTravelMode() {
        return travelMode;
    }

    public void setTravelMode(String travelMode) {
        this.travelMode = travelMode;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getGroupReference() {
        return groupReference;
    }

    public void setGroupReference(String groupReference) {
        this.groupReference = groupReference;
    }

    public Integer getHeadcount() {
        return headcount != null ? headcount : 1;
    }

    public void setHeadcount(Integer headcount) {
        this.headcount = headcount != null ? headcount : 1;
    }

    public BigDecimal getTotalCost() {
        return totalCost;
    }

    public void setTotalCost(BigDecimal totalCost) {
        this.totalCost = totalCost;
    }

    public BigDecimal getCostPerPerson() {
        return costPerPerson;
    }

    public void setCostPerPerson(BigDecimal costPerPerson) {
        this.costPerPerson = costPerPerson;
    }

    public BigDecimal getSavings() {
        return savings;
    }

    public void setSavings(BigDecimal savings) {
        this.savings = savings;
    }

    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getDepartments() {
        return departments;
    }

    public void setDepartments(String departments) {
        this.departments = departments;
    }

    public String getPassengerManifestSummary() {
        return passengerManifestSummary;
    }

    public void setPassengerManifestSummary(String passengerManifestSummary) {
        this.passengerManifestSummary = passengerManifestSummary;
    }

    public String getItineraryNotes() {
        return itineraryNotes;
    }

    public void setItineraryNotes(String itineraryNotes) {
        this.itineraryNotes = itineraryNotes;
    }

    public String getCoordinatorName() {
        return coordinatorName;
    }

    public void setCoordinatorName(String coordinatorName) {
        this.coordinatorName = coordinatorName;
    }

    public LocalDateTime getLoggedAt() {
        return loggedAt;
    }

    public void setLoggedAt(LocalDateTime loggedAt) {
        this.loggedAt = loggedAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getApproverStatus() {
        return approverStatus;
    }

    public void setApproverStatus(String approverStatus) {
        this.approverStatus = approverStatus;
    }

    public String getApproverComment() {
        return approverComment;
    }

    public void setApproverComment(String approverComment) {
        this.approverComment = approverComment;
    }

    public LocalDateTime getApproverReviewedAt() {
        return approverReviewedAt;
    }

    public void setApproverReviewedAt(LocalDateTime approverReviewedAt) {
        this.approverReviewedAt = approverReviewedAt;
    }

    public String getAttachmentName() {
        return attachmentName;
    }

    public void setAttachmentName(String attachmentName) {
        this.attachmentName = attachmentName;
    }

    public String getAttachmentData() {
        return attachmentData;
    }

    public void setAttachmentData(String attachmentData) {
        this.attachmentData = attachmentData;
    }

    public List<BulkBookingPassenger> getPassengerList() {
        return passengerList;
    }

    public void setPassengerList(List<BulkBookingPassenger> passengerList) {
        this.passengerList.clear();
        if (passengerList != null) {
            for (BulkBookingPassenger p : passengerList) {
                p.setBulkBooking(this);
                this.passengerList.add(p);
            }
        }
    }
}
