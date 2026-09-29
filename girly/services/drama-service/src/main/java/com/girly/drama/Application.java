package com.girly.drama;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Drama Service Application - Main entry point for the Drama Service.
 * 
 * This microservice handles:
 * - Interactive story creation
 * - RPG simulation games
 * - Character development
 * - Story collaboration
 * - Narrative experiences
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Drama Service API",
        version = "1.0.0",
        description = "API for story creation, RPG simulations, and interactive storytelling",
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
