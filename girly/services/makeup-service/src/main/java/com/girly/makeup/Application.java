package com.girly.makeup;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Makeup Service Application - Main entry point for the Makeup Service.
 * 
 * This microservice handles:
 * - AR virtual try-on
 * - Makeup tutorials and guides
 * - Beauty product database
 * - Look book creation
 * - Beauty community sharing
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Makeup Service API",
        version = "1.0.0",
        description = "API for AR try-on, beauty tutorials, and virtual makeup studio",
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
