package com.girly.hangout;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Hangout Service Application - Main entry point for the Hangout Service.
 * 
 * This microservice handles:
 * - Virtual hangout spaces
 * - Real-time video and chat
 * - Group activities
 * - Shared experiences
 * - Safe, moderated environments
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Hangout Service API",
        version = "1.0.0",
        description = "API for virtual hangout spaces, group activities, and real-time communication",
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
