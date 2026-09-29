package com.girly.wardrobe;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Wardrobe Service Application - Main entry point for the Wardrobe Service.
 * 
 * This microservice handles:
 * - Virtual closet management
 * - Outfit creation and styling
 * - Fashion recommendations
 * - Clothing inventory
 * - Style sharing and inspiration
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Wardrobe Service API",
        version = "1.0.0",
        description = "API for virtual closet, fashion styling, and outfit management",
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
