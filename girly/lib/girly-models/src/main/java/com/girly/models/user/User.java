package com.girly.models.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * User entity representing a user of the Girly platform.
 * 
 * This is the core user model that all services can reference.
 * Each service may extend this with service-specific data.
 */
@Entity
@Table(name = "users", schema = "user_svc")
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;
    
    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    @Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "Username can only contain letters, numbers, and underscores")
    @Column(nullable = false, unique = true, length = 50)
    private String username;
    
    @NotBlank(message = "Display name is required")
    @Size(min = 2, max = 100, message = "Display name must be between 2 and 100 characters")
    @Column(nullable = false, length = 100)
    private String displayName;
    
    @Email(message = "Email should be valid")
    @NotBlank(message = "Email is required")
    @Column(nullable = false, unique = true, length = 255)
    private String email;
    
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters long")
    @Column(nullable = false, length = 255)
    private String passwordHash;
    
    @Column(name = "profile_picture_url", length = 500)
    private String profilePictureUrl;
    
    @Column(name = "bio", length = 1000)
    @Size(max = 1000, message = "Bio must be less than 1000 characters")
    private String bio;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "gender", length = 20)
    private Gender gender;
    
    @Column(name = "pronouns", length = 50)
    private String pronouns;
    
    @Past(message = "Birth date must be in the past")
    @Column(name = "date_of_birth")
    private Instant dateOfBirth;
    
    @Column(name = "preferred_language", length = 10)
    private String preferredLanguage = "en";
    
    @Column(name = "preferred_timezone", length = 50)
    private String preferredTimezone = "UTC";
    
    @Enumerated(EnumType.STRING)
    @Column(name = "account_status", nullable = false)
    private AccountStatus accountStatus = AccountStatus.ACTIVE;
    
    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;
    
    @Column(name = "two_factor_enabled", nullable = false)
    private boolean twoFactorEnabled = false;
    
    @Column(name = "last_login_at")
    private Instant lastLoginAt;
    
    @Column(name = "last_password_change_at")
    private Instant lastPasswordChangeAt;
    
    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;
    
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    
    // Preferences
    @Column(name = "receive_newsletter", nullable = false)
    private boolean receiveNewsletter = true;
    
    @Column(name = "receive_notifications", nullable = false)
    private boolean receiveNotifications = true;
    
    @Column(name = "theme_preference", length = 20)
    private String themePreference = "light";
    
    // Social statistics
    @Column(name = "friend_count")
    private int friendCount = 0;
    
    @Column(name = "achievement_count")
    private int achievementCount = 0;
    
    // ==================== Enums ====================
    
    public enum Gender {
        FEMALE, MALE, NON_BINARY, PREFER_NOT_TO_SAY, OTHER
    }
    
    public enum AccountStatus {
        ACTIVE, INACTIVE, SUSPENDED, BANNED, DELETED
    }
    
    // ==================== Relationships ====================
    
    @JsonIgnore
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<UserPreference> preferences = new HashSet<>();
    
    @JsonIgnore
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<UserSession> sessions = new HashSet<>();
    
    @JsonIgnore
    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<UserRole> roles = new HashSet<>();
    
    // ==================== Constructors ====================
    
    public User() {}
    
    public User(String username, String displayName, String email, String passwordHash) {
        this.username = username;
        this.displayName = displayName;
        this.email = email;
        this.passwordHash = passwordHash;
    }
    
    // ==================== Getters & Setters ====================
    
    public UUID getId() {
        return id;
    }
    
    public void setId(UUID id) {
        this.id = id;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
    
    public String getPasswordHash() {
        return passwordHash;
    }
    
    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }
    
    public String getProfilePictureUrl() {
        return profilePictureUrl;
    }
    
    public void setProfilePictureUrl(String profilePictureUrl) {
        this.profilePictureUrl = profilePictureUrl;
    }
    
    public String getBio() {
        return bio;
    }
    
    public void setBio(String bio) {
        this.bio = bio;
    }
    
    public Gender getGender() {
        return gender;
    }
    
    public void setGender(Gender gender) {
        this.gender = gender;
    }
    
    public String getPronouns() {
        return pronouns;
    }
    
    public void setPronouns(String pronouns) {
        this.pronouns = pronouns;
    }
    
    public Instant getDateOfBirth() {
        return dateOfBirth;
    }
    
    public void setDateOfBirth(Instant dateOfBirth) {
        this.dateOfBirth = dateOfBirth;
    }
    
    public String getPreferredLanguage() {
        return preferredLanguage;
    }
    
    public void setPreferredLanguage(String preferredLanguage) {
        this.preferredLanguage = preferredLanguage;
    }
    
    public String getPreferredTimezone() {
        return preferredTimezone;
    }
    
    public void setPreferredTimezone(String preferredTimezone) {
        this.preferredTimezone = preferredTimezone;
    }
    
    public AccountStatus getAccountStatus() {
        return accountStatus;
    }
    
    public void setAccountStatus(AccountStatus accountStatus) {
        this.accountStatus = accountStatus;
    }
    
    public boolean isEmailVerified() {
        return emailVerified;
    }
    
    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }
    
    public boolean isTwoFactorEnabled() {
        return twoFactorEnabled;
    }
    
    public void setTwoFactorEnabled(boolean twoFactorEnabled) {
        this.twoFactorEnabled = twoFactorEnabled;
    }
    
    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
    
    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }
    
    public Instant getLastPasswordChangeAt() {
        return lastPasswordChangeAt;
    }
    
    public void setLastPasswordChangeAt(Instant lastPasswordChangeAt) {
        this.lastPasswordChangeAt = lastPasswordChangeAt;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public Instant getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public boolean isReceiveNewsletter() {
        return receiveNewsletter;
    }
    
    public void setReceiveNewsletter(boolean receiveNewsletter) {
        this.receiveNewsletter = receiveNewsletter;
    }
    
    public boolean isReceiveNotifications() {
        return receiveNotifications;
    }
    
    public void setReceiveNotifications(boolean receiveNotifications) {
        this.receiveNotifications = receiveNotifications;
    }
    
    public String getThemePreference() {
        return themePreference;
    }
    
    public void setThemePreference(String themePreference) {
        this.themePreference = themePreference;
    }
    
    public int getFriendCount() {
        return friendCount;
    }
    
    public void setFriendCount(int friendCount) {
        this.friendCount = friendCount;
    }
    
    public int getAchievementCount() {
        return achievementCount;
    }
    
    public void setAchievementCount(int achievementCount) {
        this.achievementCount = achievementCount;
    }
    
    public Set<UserPreference> getPreferences() {
        return preferences;
    }
    
    public void setPreferences(Set<UserPreference> preferences) {
        this.preferences = preferences;
    }
    
    public Set<UserSession> getSessions() {
        return sessions;
    }
    
    public void setSessions(Set<UserSession> sessions) {
        this.sessions = sessions;
    }
    
    public Set<UserRole> getRoles() {
        return roles;
    }
    
    public void setRoles(Set<UserRole> roles) {
        this.roles = roles;
    }
    
    // ==================== Helper Methods ====================
    
    public void addRole(Role role) {
        UserRole userRole = new UserRole(this, role);
        this.roles.add(userRole);
        role.getUsers().add(userRole);
    }
    
    public void removeRole(Role role) {
        this.roles.removeIf(ur -> ur.getRole().getId().equals(role.getId()));
    }
    
    public boolean hasRole(Role role) {
        return this.roles.stream()
                .anyMatch(ur -> ur.getRole().getName().equals(role.getName()));
    }
    
    public boolean hasRole(String roleName) {
        return this.roles.stream()
                .anyMatch(ur -> ur.getRole().getName().equals(roleName));
    }
    
    public void incrementFriendCount() {
        this.friendCount++;
    }
    
    public void decrementFriendCount() {
        if (this.friendCount > 0) {
            this.friendCount--;
        }
    }
    
    public void incrementAchievementCount() {
        this.achievementCount++;
    }
    
    @Override
    public String toString() {
        return "User{" +
                "id=" + id +
                ", username='" + username + '\'' +
                ", displayName='" + displayName + '\'' +
                ", email='" + email + '\'' +
                ", accountStatus=" + accountStatus +
                '}';
    }
}
