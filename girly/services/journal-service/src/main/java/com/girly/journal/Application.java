package com.girly.journal;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Journal Service Application - Main entry point for the Journal Service.
 * 
 * This microservice handles:
 * - Private journal entries
 * - Reflective writing
 * - Gratitude logging
 * - Dream journaling
 * - Secure, encrypted journal storage
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Journal Service API",
        version = "1.0.0",
        description = "API for private journaling, reflection, and emotional expression",
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
