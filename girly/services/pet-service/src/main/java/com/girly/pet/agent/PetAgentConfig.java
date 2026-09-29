package com.girly.pet.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for PetAgent.
 * 
 * Extends base AgentConfig with pet-specific settings.
 */
@ConfigurationProperties("pet.agent")
public class PetAgentConfig extends AgentConfig {
    
    /**
     * Maximum pets per user.
     */
    private int maxPetsPerUser = 5;
    
    /**
     * Enable pet evolution.
     */
    private boolean evolutionEnabled = true;
    
    /**
     * Enable multiplayer pet interactions.
     */
    private boolean multiplayerEnabled = true;
    
    /**
     * Enable pet aging.
     */
    private boolean agingEnabled = true;
    
    /**
     * Enable pet emotions.
     */
    private boolean emotionsEnabled = true;
    
    /**
     * Enable pet customization.
     */
    private boolean customizationEnabled = true;
    
    /**
     * Enable pet mini-games.
     */
    private boolean miniGamesEnabled = true;
    
    /**
     * Pet decay rate (stat decrease per hour).
     */
    private double decayRate = 0.5;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxPetsPerUser() { return maxPetsPerUser; }
    public void setMaxPetsPerUser(int maxPetsPerUser) { this.maxPetsPerUser = maxPetsPerUser; }
    
    public boolean isEvolutionEnabled() { return evolutionEnabled; }
    public void setEvolutionEnabled(boolean evolutionEnabled) { 
        this.evolutionEnabled = evolutionEnabled; 
    }
    
    public boolean isMultiplayerEnabled() { return multiplayerEnabled; }
    public void setMultiplayerEnabled(boolean multiplayerEnabled) { 
        this.multiplayerEnabled = multiplayerEnabled; 
    }
    
    public boolean isAgingEnabled() { return agingEnabled; }
    public void setAgingEnabled(boolean agingEnabled) { this.agingEnabled = agingEnabled; }
    
    public boolean isEmotionsEnabled() { return emotionsEnabled; }
    public void setEmotionsEnabled(boolean emotionsEnabled) { 
        this.emotionsEnabled = emotionsEnabled; 
    }
    
    public boolean isCustomizationEnabled() { return customizationEnabled; }
    public void setCustomizationEnabled(boolean customizationEnabled) { 
        this.customizationEnabled = customizationEnabled; 
    }
    
    public boolean isMiniGamesEnabled() { return miniGamesEnabled; }
    public void setMiniGamesEnabled(boolean miniGamesEnabled) { 
        this.miniGamesEnabled = miniGamesEnabled; 
    }
    
    public double getDecayRate() { return decayRate; }
    public void setDecayRate(double decayRate) { this.decayRate = decayRate; }
}
