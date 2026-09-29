package com.girly.health;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Health Service Application - Main entry point for the Health Service.
 * 
 * This microservice handles:
 * - Period and cycle tracking
 * - Wellness monitoring
 * - Health insights and reminders
 * - Symptom logging
 * - Medical resource access
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Health Service API",
        version = "1.0.0",
        description = "API for period tracking, wellness monitoring, and health insights",
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
