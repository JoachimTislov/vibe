package com.girly.pet;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Pet Service Application - Virtual pet companions for emotional support.
 * 
 * This microservice handles:
 * - Virtual pet creation and management
 * - Pet customization and growth
 * - Emotional bonding with pets
 * - Social features for pets
 * - Cross-service pet interactions
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Pet Service API",
        version = "1.0.0",
        description = "API for virtual pet companions that provide emotional support and companionship",
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
