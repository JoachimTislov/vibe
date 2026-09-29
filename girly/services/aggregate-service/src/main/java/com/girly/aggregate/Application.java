package com.girly.aggregate;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Aggregate Service Application - Main entry point for the Aggregate Service.
 * 
 * This microservice handles:
 * - Cross-service data aggregation
 * - Dashboard insights
 * - Platform-wide analytics
 * - User activity summaries
 * - Personalized recommendations
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Aggregate Service API",
        version = "1.0.0",
        description = "API for cross-service insights, analytics, and dashboard aggregation",
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
