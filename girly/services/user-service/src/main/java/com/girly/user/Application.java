package com.girly.user;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * User Service Application - Main entry point for the User Service.
 * 
 * This microservice handles:
 * - User registration and authentication
 * - Profile management
 * - User preferences and settings
 * - Role-based access control
 * - Session management
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly User Service API",
        version = "1.0.0",
        description = "API for user authentication, profiles, and management",
        license = @License(name = "MIT", url = "https://opensource.org/licenses/MIT"),
        contact = @Contact(
            name = "Girly Platform Team",
            email = "team@girly.tech",
            url = "https://girly.tech"
        )
    )
)
public class Application {
    
    public static void main(String[] args) {
        Micronaut.build(args)
            .banner(false)
            .mainClass(Application.class)
            .start();
    }
}
