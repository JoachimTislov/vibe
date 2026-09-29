package com.girly.games;

import io.micronaut.runtime.Micronaut;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;

/**
 * Games Service Application - Main entry point for the Games Service.
 * 
 * This microservice handles:
 * - Mini-games and casual gaming
 * - Multiplayer game sessions
 * - Leaderboards and achievements
 * - Game state management
 * - Collaborative and competitive games
 */
@OpenAPIDefinition(
    info = @Info(
        title = "Girly Games Service API",
        version = "1.0.0",
        description = "API for mini-games, multiplayer experiences, and interactive gaming",
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
