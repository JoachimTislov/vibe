package com.girly.common.exception;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Error;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.hateoas.JsonError;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Global exception handler for Girly microservices.
 * 
 * This handler catches all exceptions and converts them to standardized
 * JSON error responses with proper HTTP status codes.
 */
@Produces
@Singleton
public class ExceptionHandler {
    
    @Inject
    private ObjectMapper objectMapper;
    
    /**
     * Handles all GirlyException instances
     */
    @Error(global = true)
    public HttpResponse<?> handleGirlyException(HttpRequest<?> request, GirlyException ex) {
        Map<String, Object> errorResponse = buildErrorResponse(ex);
        return HttpResponse
                .status(ex.getHttpStatus())
                .body(errorResponse);
    }
    
    /**
     * Handles all other uncaught exceptions
     */
    @Error(global = true)
    public HttpResponse<?> handleUnexpectedException(HttpRequest<?> request, Throwable ex) {
        Map<String, Object> errorResponse = new LinkedHashMap<>();
        errorResponse.put("errorCode", "INTERNAL_ERROR");
        errorResponse.put("errorMessage", "An unexpected error occurred");
        errorResponse.put("status", HttpStatus.INTERNAL_SERVER_ERROR.getCode());
        errorResponse.put("timestamp", System.currentTimeMillis());
        errorResponse.put("path", request.getPath());
        
        // In dev mode, include the actual error message
        if (isDevelopment()) {
            errorResponse.put("debugMessage", ex.getMessage());
        }
        
        return HttpResponse
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
    }
    
    /**
     * Handles validation exceptions specifically
     */
    @Error(global = true)
    public HttpResponse<?> handleValidationException(HttpRequest<?> request, 
                                                      GirlyException.ValidationException ex) {
        Map<String, Object> errorResponse = buildErrorResponse(ex);
        // Add validation errors if present
        if (ex.getDetails() != null) {
            errorResponse.put("validationErrors", ex.getDetails());
        }
        return HttpResponse
                .status(ex.getHttpStatus())
                .body(errorResponse);
    }
    
    private Map<String, Object> buildErrorResponse(GirlyException ex) {
        Map<String, Object> errorResponse = new LinkedHashMap<>();
        errorResponse.put("errorCode", ex.getErrorCode());
        errorResponse.put("errorMessage", ex.getErrorMessage());
        errorResponse.put("status", ex.getHttpStatus().getCode());
        errorResponse.put("timestamp", System.currentTimeMillis());
        
        // Add details if present
        if (ex.getDetails() != null) {
            errorResponse.put("details", ex.getDetails());
        }
        
        return errorResponse;
    }
    
    private boolean isDevelopment() {
        String env = System.getenv("MICRONAUT_ENVIRONMENTS");
        return "dev".equalsIgnoreCase(env) || "development".equalsIgnoreCase(env);
    }
}
