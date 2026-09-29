package com.girly.mood;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Mood Service Application - Main entry point for the Mood Service.
 * 
 * This microservice handles:
 * - Mood tracking and emotion logging
 * - Daily mood reflections
 * - Emotional analytics and insights
 * - Mood trend analysis
 * - Emotional support resources
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Mood Service API",
        version = "1.0.0",
        description = "API for mood tracking, emotional support, and reflection",
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
