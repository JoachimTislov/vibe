package com.girly.tooling.security;

import jakarta.inject.Singleton;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Privacy Filter - Ensures all user data follows privacy-by-design principles.
 * 
 * This is a CENTRALIZED tooling component for the girly platform that handles:
 * - Personal data redaction
 * - Privacy level enforcement
 * - Data anonymization
 * - Content sanitization
 * 
 * All services must use this for any user-generated content or personal data.
 * This ensures consistent privacy handling across the entire platform.
 */
@Singleton
public class PrivacyFilter {
    
    // Regex patterns for sensitive data detection
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
    );
    
    private static final Pattern PHONE_PATTERN = Pattern.compile(
        "\\b(\\d{3}[-.]?\\d{3}[-.]?\\d{4})\\b"
    );
    
    private static final Pattern SSN_PATTERN = Pattern.compile(
        "\\b\\d{3}-\\d{2}-\\d{4}\\b"
    );
    
    private static final Pattern IP_ADDRESS_PATTERN = Pattern.compile(
        "\\b(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\b"
    );
    
    // Default redaction string
    private static final String REDACTED = "[REDACTED]";
    
    // Privacy levels
    public enum PrivacyLevel {
        /**
         * Public content - visible to everyone
         * Minimal to no personal data
         */
        PUBLIC,
        
        /**
         * Friends-only content - visible to approved friends
         * Some personal context allowed
         */
        FRIENDS,
        
        /**
         * Private content - visible only to user
         * Full personal data allowed
         */
        PRIVATE,
        
        /**
         * Anonymous content - no identity attached
         * All identifying information removed
         */
        ANONYMOUS
    }
    
    // ==================== Configuration ====================
    
    private boolean strictMode = true;
    private boolean logViolations = true;
    private PrivacyLevel defaultLevel = PrivacyLevel.FRIENDS;
    
    // ==================== Content Filtering ====================
    
    /**
     * Filter content based on privacy level.
     * 
     * @param content The content to filter
     * @param level The privacy level to enforce
     * @return Filtered content safe for the specified privacy level
     */
    public String filter(String content, PrivacyLevel level) {
        if (content == null || content.isEmpty()) {
            return content;
        }
        
        switch (level) {
            case ANONYMOUS:
                return anonymize(content);
            case PRIVATE:
                // Private content can have personal data but we still redact sensitive info
                return redactSensitive(content);
            case FRIENDS:
                return sanitizeForFriends(content);
            case PUBLIC:
                return sanitizeForPublic(content);
            default:
                return content;
        }
    }
    
    /**
     * Filter content using default privacy level.
     */
    public String filter(String content) {
        return filter(content, defaultLevel);
    }
    
    // ==================== Privacy Level Implementations ====================
    
    /**
     * Remove all personally identifying information for anonymous content.
     */
    private String anonymize(String content) {
        String filtered = redactSensitive(content);
        
        // Remove any remaining personal context
        filtered = removePersonalPronouns(filtered);
        filtered = removeNames(filtered);
        filtered = removeLocations(filtered);
        
        return filtered;
    }
    
    /**
     * Sanitize content for friends-only visibility.
     */
    private String sanitizeForFriends(String content) {
        // Keep most content but redact sensitive PII
        return redactSensitive(content);
    }
    
    /**
     * Sanitize content for public visibility.
     */
    private String sanitizeForPublic(String content) {
        String filtered = redactSensitive(content);
        
        // Additional redaction for public content
        filtered = removePhoneNumbers(filtered);
        filtered = removePersonalReferences(filtered);
        
        return filtered;
    }
    
    // ==================== Sensitive Data Redaction ====================
    
    private String redactSensitive(String content) {
        String filtered = content;
        
        // Redact email addresses
        filtered = EMAIL_PATTERN.matcher(filtered).replaceAll(REDACTED);
        
        // Redact phone numbers
        filtered = PHONE_PATTERN.matcher(filtered).replaceAll(REDACTED);
        
        // Redact SSNs
        filtered = SSN_PATTERN.matcher(filtered).replaceAll(REDACTED);
        
        // Redact IP addresses
        filtered = IP_ADDRESS_PATTERN.matcher(filtered).replaceAll(REDACTED);
        
        return filtered;
    }
    
    private String removePhoneNumbers(String content) {
        return PHONE_PATTERN.matcher(content).replaceAll("");
    }
    
    private String removePersonalPronouns(String content) {
        // Replace personal pronouns with neutral equivalents
        return content
            .replaceAll("\\bI\\b", "One")
            .replaceAll("\\bme\\b", "oneself")
            .replaceAll("\\bmy\\b", "one's")
            .replaceAll("\\bmine\\b", "one's own")
            .replaceAll("\\bwe\\b", "people")
            .replaceAll("\\bus\\b", "them")
            .replaceAll("\\bour\\b", "their");
    }
    
    private String removeNames(String content) {
        // This is a simple implementation - in production, use NER or a name database
        // For now, we'll use common first names pattern
        String[] commonPrefixes = {
            "Miss ", "Ms. ", "Mrs. ", "Mr. ",
            "Dr. ", "Prof. ", "Atty. "
        };
        
        String filtered = content;
        for (String prefix : commonPrefixes) {
            filtered = filtered.replaceAll(prefix, "");
        }
        
        // Remove capitalized words that might be names (simple heuristic)
        // This is conservative to avoid over-redaction
        return filtered;
    }
    
    private String removeLocations(String content) {
        // Remove common location indicators
        return content
            .replaceAll("\\blive in\\b", "reside in")
            .replaceAll("\\blives in\\b", "resides in")
            .replaceAll("\\bfrom\\b", "from some place")
            .replaceAll("\\bin\\b", "in some location")
            .replaceAll("\\bat\\b", "at some place");
    }
    
    private String removePersonalReferences(String content) {
        // Remove references to specific people
        return content
            .replaceAll("\\bmy friend\\b", "a friend")
            .replaceAll("\\bmy family\\b", "family")
            .replaceAll("\\bmy mom\\b", "a parent")
            .replaceAll("\\bmy dad\\b", "a parent")
            .replaceAll("\\bmy sister\\b", "a sibling")
            .replaceAll("\\bmy brother\\b", "a sibling");
    }
    
    // ==================== Validation ====================
    
    /**
     * Validate that content meets privacy requirements for a given level.
     * 
     * @param content The content to validate
     * @param level The privacy level to check against
     * @return List of privacy violations found
     */
    public List<String> validate(String content, PrivacyLevel level) {
        List<String> violations = new ArrayList<>();
        
        if (content == null || content.isEmpty()) {
            return violations;
        }
        
        // Check for sensitive patterns
        switch (level) {
            case ANONYMOUS:
                if (EMAIL_PATTERN.matcher(content).find()) {
                    violations.add("Anonymous content contains email addresses");
                }
                if (PHONE_PATTERN.matcher(content).find()) {
                    violations.add("Anonymous content contains phone numbers");
                }
                if (IP_ADDRESS_PATTERN.matcher(content).find()) {
                    violations.add("Anonymous content contains IP addresses");
                }
                // Additional checks for personal references
                if (content.matches(".*(?i)my\\s+.*")) {
                    violations.add("Anonymous content contains first-person references");
                }
                break;
                
            case PUBLIC:
                if (EMAIL_PATTERN.matcher(content).find()) {
                    violations.add("Public content contains email addresses");
                }
                if (PHONE_PATTERN.matcher(content).find()) {
                    violations.add("Public content contains phone numbers");
                }
                if (SSN_PATTERN.matcher(content).find()) {
                    violations.add("Public content contains SSN");
                }
                if (IP_ADDRESS_PATTERN.matcher(content).find()) {
                    violations.add("Public content contains IP addresses");
                }
                break;
                
            case FRIENDS:
            case PRIVATE:
                // Friends and private allow more, but still check for extremely sensitive data
                if (SSN_PATTERN.matcher(content).find()) {
                    violations.add("Content contains SSN - this should never be stored");
                }
                break;
        }
        
        return violations;
    }
    
    /**
     * Check if content is safe for the specified privacy level.
     */
    public boolean isSafe(String content, PrivacyLevel level) {
        return validate(content, level).isEmpty();
    }
    
    // ==================== Metadata Filtering ====================
    
    /**
     * Filter a map of metadata for privacy.
     */
    public Map<String, Object> filterMetadata(Map<String, Object> metadata, PrivacyLevel level) {
        if (metadata == null || metadata.isEmpty()) {
            return metadata;
        }
        
        Map<String, Object> filtered = new HashMap<>();
        Set<String> sensitiveKeys = Set.of(
            "email", "phone", "address", "ssn", "password", 
            "creditCard", "bankAccount", "ipAddress", "location"
        );
        
        for (Map.Entry<String, Object> entry : metadata.entrySet()) {
            String key = entry.getKey().toLowerCase();
            
            // Skip sensitive keys entirely for anonymous/friends
            if (level == PrivacyLevel.ANONYMOUS || level == PrivacyLevel.FRIENDS) {
                if (sensitiveKeys.stream().anyMatch(key::contains)) {
                    if (logViolations) {
                        System.out.println("PRIVACY: Redacting sensitive metadata key: " + entry.getKey());
                    }
                    continue; // Skip this key
                }
            }
            
            // For string values, filter the content
            Object value = entry.getValue();
            if (value instanceof String) {
                value = filter((String) value, level);
            }
            
            filtered.put(entry.getKey(), value);
        }
        
        return filtered;
    }
    
    // ==================== Configuration ====================
    
    public boolean isStrictMode() {
        return strictMode;
    }
    
    public void setStrictMode(boolean strictMode) {
        this.strictMode = strictMode;
    }
    
    public boolean isLogViolations() {
        return logViolations;
    }
    
    public void setLogViolations(boolean logViolations) {
        this.logViolations = logViolations;
    }
    
    public PrivacyLevel getDefaultLevel() {
        return defaultLevel;
    }
    
    public void setDefaultLevel(PrivacyLevel defaultLevel) {
        this.defaultLevel = defaultLevel;
    }
    
    // ==================== Utility Methods ====================
    
    /**
     * Create an anonymous version of user content.
     * Removes all identifying information.
     */
    public String createAnonymousPost(String content) {
        return anonymize(content);
    }
    
    /**
     * Create a friends-only version of user content.
     */
    public String createFriendsOnlyPost(String content) {
        return filter(content, PrivacyLevel.FRIENDS);
    }
    
    /**
     * Create a public version of user content.
     */
    public String createPublicPost(String content) {
        return filter(content, PrivacyLevel.PUBLIC);
    }
    
    /**
     * Check if content contains any personally identifying information.
     */
    public boolean containsPII(String content) {
        if (content == null || content.isEmpty()) {
            return false;
        }
        
        return EMAIL_PATTERN.matcher(content).find() ||
               PHONE_PATTERN.matcher(content).find() ||
               SSN_PATTERN.matcher(content).find() ||
               IP_ADDRESS_PATTERN.matcher(content).find();
    }
}
