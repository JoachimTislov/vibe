package com.girly.tooling.security;

import jakarta.inject.Singleton;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Security Validator - Centralized security validation for all girly services.
 * 
 * This is a CENTRALIZED tooling component that provides:
 * - Input validation and sanitization
 * - Security header validation
 * - Rate limiting support
 * - Content security scanning
 * 
 * All services should use this for security validation to ensure
 * consistent security practices across the platform.
 */
@Singleton
public class SecurityValidator {
    
    // Maximum lengths for various inputs
    private static final int MAX_USERNAME_LENGTH = 50;
    private static final int MAX_PASSWORD_LENGTH = 128;
    private static final int MAX_EMAIL_LENGTH = 255;
    private static final int MAX_CONTENT_LENGTH = 10000;
    private static final int MAX_COMMENT_LENGTH = 2000;
    private static final int MAX_TAG_LENGTH = 100;
    
    // Pattern for valid usernames (alphanumeric + underscore, hyphen, dot)
    private static final Pattern USERNAME_PATTERN = Pattern.compile(
        "^[a-zA-Z0-9][a-zA-Z0-9_.-]*[a-zA-Z0-9]$"
    );
    
    // Pattern for valid emails
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
    );
    
    // Pattern for strong passwords (at least 8 chars, one uppercase, one lowercase, one digit, one special)
    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\\"\\\\|,.<>\\/?]).{8,}$"
    );
    
    // Pattern to detect potential XSS attempts
    private static final Pattern XSS_PATTERN = Pattern.compile(
        "(<script.*?>.*?</script>)|(javascript:)|(onerror=)|(onclick=)|(onload=)",
        Pattern.CASE_INSENSITIVE
    );
    
    // Pattern to detect SQL injection attempts
    private static final Pattern SQL_INJECTION_PATTERN = Pattern.compile(
        "('.*--)|(--.*'?)|(;.*'?)|('.*;)|(\\\.\\\.)|(SELECT.*FROM)|(INSERT.*INTO)|(UPDATE.*SET)|(DELETE.*FROM)",
        Pattern.CASE_INSENSITIVE
    );
    
    // List of blocked words/phrases
    private static final Set<String> BLOCKED_WORDS = Set.of(
        "password", "secret", "admin", "root", "suicide", "kill yourself",
        "hate", "racism", "sexist", "harass", "bully", "abuse"
    );
    
    // List of required HTTP security headers
    private static final Set<String> REQUIRED_SECURITY_HEADERS = Set.of(
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "X-XSS-Protection",
        "Strict-Transport-Security"
    );
    
    // ==================== Validation Methods ====================
    
    /**
     * Validate a username.
     */
    public ValidationResult validateUsername(String username) {
        if (username == null || username.isEmpty()) {
            return ValidationResult.fail("Username cannot be empty");
        }
        
        if (username.length() < 3) {
            return ValidationResult.fail("Username must be at least 3 characters");
        }
        
        if (username.length() > MAX_USERNAME_LENGTH) {
            return ValidationResult.fail("Username must be less than " + MAX_USERNAME_LENGTH + " characters");
        }
        
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            return ValidationResult.fail(
                "Username can only contain letters, numbers, underscores, hyphens, and dots, " +
                "and must start and end with a letter or number"
            );
        }
        
        // Check for blocked words
        String lowerUsername = username.toLowerCase();
        for (String blocked : BLOCKED_WORDS) {
            if (lowerUsername.contains(blocked)) {
                return ValidationResult.fail("Username contains a blocked word");
            }
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Validate an email address.
     */
    public ValidationResult validateEmail(String email) {
        if (email == null || email.isEmpty()) {
            return ValidationResult.fail("Email cannot be empty");
        }
        
        if (email.length() > MAX_EMAIL_LENGTH) {
            return ValidationResult.fail("Email must be less than " + MAX_EMAIL_LENGTH + " characters");
        }
        
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            return ValidationResult.fail("Invalid email format");
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Validate a password.
     */
    public ValidationResult validatePassword(String password, boolean requireStrong) {
        if (password == null || password.isEmpty()) {
            return ValidationResult.fail("Password cannot be empty");
        }
        
        if (password.length() < 8) {
            return ValidationResult.fail("Password must be at least 8 characters");
        }
        
        if (password.length() > MAX_PASSWORD_LENGTH) {
            return ValidationResult.fail("Password must be less than " + MAX_PASSWORD_LENGTH + " characters");
        }
        
        if (requireStrong && !STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            return ValidationResult.fail(
                "Password must contain at least one uppercase letter, one lowercase letter, " +
                "one digit, and one special character"
            );
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Validate user-generated content.
     */
    public ValidationResult validateContent(String content) {
        if (content == null || content.isEmpty()) {
            return ValidationResult.fail("Content cannot be empty");
        }
        
        if (content.length() > MAX_CONTENT_LENGTH) {
            return ValidationResult.fail("Content must be less than " + MAX_CONTENT_LENGTH + " characters");
        }
        
        // Check for XSS attempts
        if (XSS_PATTERN.matcher(content).find()) {
            return ValidationResult.fail("Content contains potentially harmful scripts");
        }
        
        // Check for SQL injection attempts
        if (SQL_INJECTION_PATTERN.matcher(content).find()) {
            return ValidationResult.fail("Content contains potentially harmful SQL");
        }
        
        // Check for blocked words
        String lowerContent = content.toLowerCase();
        for (String blocked : BLOCKED_WORDS) {
            if (lowerContent.contains(blocked)) {
                return ValidationResult.fail("Content contains a blocked word or phrase");
            }
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Validate a comment.
     */
    public ValidationResult validateComment(String comment) {
        if (comment == null || comment.isEmpty()) {
            return ValidationResult.fail("Comment cannot be empty");
        }
        
        if (comment.length() > MAX_COMMENT_LENGTH) {
            return ValidationResult.fail("Comment must be less than " + MAX_COMMENT_LENGTH + " characters");
        }
        
        return validateContent(comment);
    }
    
    /**
     * Validate a tag.
     */
    public ValidationResult validateTag(String tag) {
        if (tag == null || tag.isEmpty()) {
            return ValidationResult.fail("Tag cannot be empty");
        }
        
        if (tag.length() > MAX_TAG_LENGTH) {
            return ValidationResult.fail("Tag must be less than " + MAX_TAG_LENGTH + " characters");
        }
        
        // Tags should not contain spaces or special characters
        if (!tag.matches("^[a-zA-Z0-9_.-]+$")) {
            return ValidationResult.fail("Tag can only contain letters, numbers, underscores, hyphens, and dots");
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Sanitize content by escaping HTML special characters.
     */
    public String sanitizeHtml(String content) {
        if (content == null) {
            return null;
        }
        
        return content
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }
    
    /**
     * Sanitize content for safe display (removes harmful content).
     */
    public String sanitizeForDisplay(String content) {
        if (content == null) {
            return null;
        }
        
        // Remove XSS attempts
        String sanitized = XSS_PATTERN.matcher(content).replaceAll("");
        
        // Escape HTML
        sanitized = sanitizeHtml(sanitized);
        
        return sanitized;
    }
    
    // ==================== Security Header Validation ====================
    
    /**
     * Validate that required security headers are present.
     */
    public ValidationResult validateSecurityHeaders(Map<String, String> headers) {
        List<String> missingHeaders = new ArrayList<>();
        
        for (String requiredHeader : REQUIRED_SECURITY_HEADERS) {
            if (!headers.containsKey(requiredHeader)) {
                missingHeaders.add(requiredHeader);
            }
        }
        
        if (!missingHeaders.isEmpty()) {
            return ValidationResult.fail(
                "Missing required security headers: " + String.join(", ", missingHeaders)
            );
        }
        
        return ValidationResult.success();
    }
    
    /**
     * Get the default security headers that should be set on all responses.
     */
    public Map<String, String> getDefaultSecurityHeaders() {
        Map<String, String> headers = new HashMap<>();
        
        headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("X-Frame-Options", "DENY");
        headers.put("X-XSS-Protection", "1; mode=block");
        headers.put("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
        headers.put("Referrer-Policy", "strict-origin-when-cross-origin");
        headers.put("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
        
        return headers;
    }
    
    // ==================== Rate Limiting Support ====================
    
    /**
     * Rate limit configuration for different operations.
     */
    public static class RateLimitConfig {
        private final int maxRequests;
        private final long timeWindowSeconds;
        
        public RateLimitConfig(int maxRequests, long timeWindowSeconds) {
            this.maxRequests = maxRequests;
            this.timeWindowSeconds = timeWindowSeconds;
        }
        
        public int getMaxRequests() {
            return maxRequests;
        }
        
        public long getTimeWindowSeconds() {
            return timeWindowSeconds;
        }
    }
    
    // Default rate limits for different operations
    private static final Map<String, RateLimitConfig> DEFAULT_RATE_LIMITS = Map.of(
        "login", new RateLimitConfig(5, 60),       // 5 attempts per minute
        "password_reset", new RateLimitConfig(3, 3600), // 3 attempts per hour
        "api_call", new RateLimitConfig(100, 60),   // 100 calls per minute
        "upload", new RateLimitConfig(10, 60),       // 10 uploads per minute
        "message", new RateLimitConfig(50, 60)        // 50 messages per minute
    );
    
    /**
     * Get the default rate limit configuration for an operation.
     */
    public RateLimitConfig getRateLimitConfig(String operation) {
        return DEFAULT_RATE_LIMITS.getOrDefault(operation, new RateLimitConfig(60, 60));
    }
    
    // ==================== Validation Result ====================
    
    /**
     * Result of a validation operation.
     */
    public static class ValidationResult {
        private final boolean valid;
        private final String errorMessage;
        private final List<String> warnings;
        
        private ValidationResult(boolean valid, String errorMessage, List<String> warnings) {
            this.valid = valid;
            this.errorMessage = errorMessage;
            this.warnings = warnings != null ? warnings : new ArrayList<>();
        }
        
        public static ValidationResult success() {
            return new ValidationResult(true, null, null);
        }
        
        public static ValidationResult successWithWarnings(List<String> warnings) {
            return new ValidationResult(true, null, warnings);
        }
        
        public static ValidationResult fail(String errorMessage) {
            return new ValidationResult(false, errorMessage, null);
        }
        
        public static ValidationResult fail(String errorMessage, List<String> warnings) {
            return new ValidationResult(false, errorMessage, warnings);
        }
        
        public boolean isValid() {
            return valid;
        }
        
        public String getErrorMessage() {
            return errorMessage;
        }
        
        public List<String> getWarnings() {
            return warnings;
        }
        
        public boolean hasWarnings() {
            return !warnings.isEmpty();
        }
    }
}
