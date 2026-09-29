package com.girly.productivity;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Productivity Service Application - Main entry point for the Productivity Service.
 * 
 * This microservice handles:
 * - Task and project management
 * - Habit tracking
 * - Goal setting and achievement
 * - Time management
 * - Productivity analytics
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Productivity Service API",
        version = "1.0.0",
        description = "API for task management, habit tracking, and goal setting",
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
