package com.girly.pet;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Pet Service Application - Main entry point for the Pet Service.
 * 
 * This microservice handles:
 * - Virtual pet adoption
 * - Pet care and interaction
 * - Pet growth and evolution
 * - Emotional companion features
 * - Multi-pet management
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Pet Service API",
        version = "1.0.0",
        description = "API for virtual pet companions, adoption, and care simulation",
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
