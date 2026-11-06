package com.traveldesk.backend.auth;

import com.traveldesk.backend.company.Company;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonProperty;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "company_id")
    private Company company;

    @Column(nullable = false, unique = true)
    private String username;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private Boolean active = true;

    private String employeeId;

    @Column(name = "created_at")
    private java.time.LocalDateTime createdAt = java.time.LocalDateTime.now();

    @Column(name = "activation_token_hash")
    private String activationTokenHash;

    @Column(name = "activation_token_expires_at")
    private java.time.LocalDateTime activationTokenExpiresAt;

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

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public Boolean isActive() {
        return Boolean.TRUE.equals(active);
    }

    public void setActive(Boolean active) {
        this.active = active != null ? active : true;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public java.time.LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(java.time.LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public String getActivationTokenHash() {
        return activationTokenHash;
    }

    public void setActivationTokenHash(String activationTokenHash) {
        this.activationTokenHash = activationTokenHash;
    }

    public java.time.LocalDateTime getActivationTokenExpiresAt() {
        return activationTokenExpiresAt;
    }

    public void setActivationTokenExpiresAt(java.time.LocalDateTime activationTokenExpiresAt) {
        this.activationTokenExpiresAt = activationTokenExpiresAt;
    }
}