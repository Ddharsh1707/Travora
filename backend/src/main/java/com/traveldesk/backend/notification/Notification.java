package com.traveldesk.backend.notification;

import com.traveldesk.backend.auth.User;
import com.traveldesk.backend.company.Company;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "notifications", indexes = {
        @Index(name = "idx_notification_recipient_created", columnList = "recipient_id, createdAt"),
        @Index(name = "idx_notification_recipient_read", columnList = "recipient_id, read"),
        @Index(name = "idx_notifications_company_id", columnList = "company_id")
})
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "company_id") private Company company;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) @JoinColumn(name = "recipient_id", nullable = false) private User recipient;
    @Column(nullable = false) private String title;
    @Column(nullable = false, length = 1000) private String message;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private NotificationType type;
    private Long travelRequestId;
    private Long bookingId;
    @Column(name = "read", nullable = false) private Boolean read = false;
    @Column(nullable = false) private LocalDateTime createdAt = LocalDateTime.now();
    public Long getId() { return id; }
    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }
    @JsonIgnore public User getRecipient() { return recipient; }
    public void setRecipient(User recipient) { this.recipient = recipient; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public NotificationType getType() { return type; }
    public void setType(NotificationType type) { this.type = type; }
    public Long getTravelRequestId() { return travelRequestId; }
    public void setTravelRequestId(Long travelRequestId) { this.travelRequestId = travelRequestId; }
    public Long getBookingId() { return bookingId; }
    public void setBookingId(Long bookingId) { this.bookingId = bookingId; }
    public Boolean isRead() { return Boolean.TRUE.equals(read); }
    public Boolean getRead() { return Boolean.TRUE.equals(read); }
    public void setRead(Boolean read) { this.read = read != null ? read : false; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
