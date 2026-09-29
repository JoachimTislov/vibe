package com.girly.social;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Social Service Application - Main entry point for the Social Service.
 * 
 * This microservice handles:
 * - Safe friend management
 * - Secure messaging
 * - Community building
 * - Shared interests and activities
 * - Privacy-first social features
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Social Service API",
        version = "1.0.0",
        description = "API for safe social interactions, friend management, and community building",
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
