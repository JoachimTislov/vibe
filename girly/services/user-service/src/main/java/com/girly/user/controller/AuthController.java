package com.girly.user.controller;

import com.girly.common.Constants;
import com.girly.common.exception.GirlyException;
import com.girly.models.user.User;
import com.girly.user.dto.request.LoginRequest;
import com.girly.user.dto.request.RefreshTokenRequest;
import com.girly.user.dto.request.RegisterRequest;
import com.girly.user.dto.response.AuthResponse;
import com.girly.user.dto.response.UserResponse;
import com.girly.user.service.AuthService;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.*;
import io.micronaut.security.annotation.SecurityRule;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/**
 * Authentication Controller - Handles user registration, login, and token management.
 */
@Controller("/api/" + Constants.API_VERSION + "/auth")
@Tag(name = "Authentication", description = "User authentication and registration")
public class AuthController {
    
    private final AuthService authService;
    
    public AuthController(AuthService authService) {
        this.authService = authService;
    }
    
    /**
     * Register a new user
     */
    @Post("/register")
    @Operation(summary = "Register a new user", description = "Creates a new user account")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    public HttpResponse<AuthResponse> register(@Body @Valid RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return HttpResponse
                .created(response)
                .header("Location", "/api/" + Constants.API_VERSION + "/users/" + response.getUser().getId());
    }
    
    /**
     * Login with existing credentials
     */
    @Post("/login")
    @Operation(summary = "Login", description = "Authenticate user and return access token")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    public HttpResponse<AuthResponse> login(@Body @Valid LoginRequest request) {
        AuthResponse response = authService.login(request);
        return HttpResponse.ok(response);
    }
    
    /**
     * Refresh access token using refresh token
     */
    @Post("/refresh")
    @Operation(summary = "Refresh token", description = "Get new access token using refresh token")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    public HttpResponse<AuthResponse> refresh(@Body @Valid RefreshTokenRequest request) {
        AuthResponse response = authService.refreshToken(request.getRefreshToken());
        return HttpResponse.ok(response);
    }
    
    /**
     * Logout - invalidate current session
     */
    @Post("/logout")
    @Operation(summary = "Logout", description = "Invalidate current user session")
    @Status(HttpStatus.NO_CONTENT)
    public HttpResponse<?> logout() {
        authService.logout();
        return HttpResponse.noContent();
    }
    
    /**
     * Logout from all sessions
     */
    @Post("/logout-all")
    @Operation(summary = "Logout from all sessions", description = "Invalidate all user sessions")
    @Status(HttpStatus.NO_CONTENT)
    public HttpResponse<?> logoutAll() {
        authService.logoutAll();
        return HttpResponse.noContent();
    }
    
    /**
     * Get current user profile
     */
    @Get("/me")
    @Operation(summary = "Get current user", description = "Get profile of authenticated user")
    public HttpResponse<UserResponse> getCurrentUser() {
        User user = authService.getCurrentUser();
        return HttpResponse.ok(new UserResponse(user));
    }
    
    /**
     * Verify email address
     */
    @Get("/verify-email/{token}")
    @Operation(summary = "Verify email", description = "Verify user email address with token")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    public HttpResponse<UserResponse> verifyEmail(@PathVariable String token) {
        User user = authService.verifyEmail(token);
        return HttpResponse.ok(new UserResponse(user));
    }
    
    /**
     * Request password reset
     */
    @Post("/forgot-password")
    @Operation(summary = "Request password reset", description = "Send password reset email")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    @Status(HttpStatus.NO_CONTENT)
    public HttpResponse<?> forgotPassword(@QueryValue String email) {
        authService.requestPasswordReset(email);
        return HttpResponse.noContent();
    }
    
    /**
     * Reset password with token
     */
    @Post("/reset-password")
    @Operation(summary = "Reset password", description = "Reset password using reset token")
    @SecurityRule(securityRequirements = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "none"))
    @Status(HttpStatus.NO_CONTENT)
    public HttpResponse<?> resetPassword(
            @QueryValue String token,
            @Body @Valid String newPassword) {
        authService.resetPassword(token, newPassword);
        return HttpResponse.noContent();
    }
}
