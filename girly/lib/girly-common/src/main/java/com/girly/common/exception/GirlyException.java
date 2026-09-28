package com.girly.common.exception;

import io.micronaut.http.HttpStatus;

/**
 * Base exception class for all Girly platform exceptions.
 * 
 * This exception provides a standardized way to handle errors across all
 * microservices with consistent error codes, messages, and HTTP status codes.
 */
public class GirlyException extends RuntimeException {
    
    private final HttpStatus httpStatus;
    private final String errorCode;
    private final String errorMessage;
    private final Object details;
    
    public GirlyException(HttpStatus httpStatus, String errorCode, String errorMessage) {
        this(httpStatus, errorCode, errorMessage, null);
    }
    
    public GirlyException(HttpStatus httpStatus, String errorCode, String errorMessage, Object details) {
        super(errorMessage);
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.details = details;
    }
    
    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
    
    public String getErrorCode() {
        return errorCode;
    }
    
    public String getErrorMessage() {
        return errorMessage;
    }
    
    public Object getDetails() {
        return details;
    }
    
    /**
     * Pre-defined exception types for common scenarios
     */
    public static class NotFound extends GirlyException {
        public NotFound(String resourceType, String resourceId) {
            super(HttpStatus.NOT_FOUND, "NOT_FOUND", resourceType + " with id '" + resourceId + "' not found");
        }
        
        public NotFound(String message) {
            super(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
        }
    }
    
    public static class AlreadyExists extends GirlyException {
        public AlreadyExists(String resourceType, String identifier) {
            super(HttpStatus.CONFLICT, "ALREADY_EXISTS", 
                  resourceType + " with identifier '" + identifier + "' already exists");
        }
    }
    
    public static class Unauthorized extends GirlyException {
        public Unauthorized(String message) {
            super(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message != null ? message : "Authentication required");
        }
    }
    
    public static class Forbidden extends GirlyException {
        public Forbidden(String message) {
            super(HttpStatus.FORBIDDEN, "FORBIDDEN", message != null ? message : "Access denied");
        }
    }
    
    public static class BadRequest extends GirlyException {
        public BadRequest(String message) {
            super(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
        }
        
        public BadRequest(String message, Object details) {
            super(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message, details);
        }
    }
    
    public static class ValidationException extends GirlyException {
        public ValidationException(String message, Object validationErrors) {
            super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, validationErrors);
        }
    }
    
    public static class InternalServerError extends GirlyException {
        public InternalServerError(String message) {
            super(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", message);
        }
        
        public InternalServerError(String message, Throwable cause) {
            super(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", message);
            initCause(cause);
        }
    }
    
    public static class ServiceUnavailable extends GirlyException {
        public ServiceUnavailable(String serviceName) {
            super(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", 
                  "Service '" + serviceName + "' is temporarily unavailable");
        }
    }
    
    public static class RateLimitExceeded extends GirlyException {
        public RateLimitExceeded(long retryAfterSeconds) {
            super(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED", 
                  "Rate limit exceeded. Please try again in " + retryAfterSeconds + " seconds.");
        }
    }
    
    // ==================== Emotional/Social Exceptions ====================
    
    public static class PetException extends GirlyException {
        public PetException(String message) {
            super(HttpStatus.BAD_REQUEST, "PET_ERROR", message);
        }
    }
    
    public static class MoodException extends GirlyException {
        public MoodException(String message) {
            super(HttpStatus.BAD_REQUEST, "MOOD_ERROR", message);
        }
    }
    
    public static class SocialException extends GirlyException {
        public SocialException(String message) {
            super(HttpStatus.BAD_REQUEST, "SOCIAL_ERROR", message);
        }
    }
    
    public static class DramaException extends GirlyException {
        public DramaException(String message) {
            super(HttpStatus.BAD_REQUEST, "DRAMA_ERROR", message);
        }
    }
}
