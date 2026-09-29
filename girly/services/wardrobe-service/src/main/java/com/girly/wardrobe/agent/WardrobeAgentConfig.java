package com.girly.wardrobe.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for WardrobeAgent.
 * 
 * Extends base AgentConfig with wardrobe-specific settings.
 */
@ConfigurationProperties("wardrobe.agent")
public class WardrobeAgentConfig extends AgentConfig {
    
    /**
     * Maximum clothing items per user.
     */
    private int maxItemsPerUser = 1000;
    
    /**
     * Maximum outfits per user.
     */
    private int maxOutfitsPerUser = 500;
    
    /**
     * Enable AR virtual try-on.
     */
    private boolean arTryOnEnabled = true;
    
    /**
     * Enable style recommendations.
     */
    private boolean styleRecommendationsEnabled = true;
    
    /**
     * Enable sharing with friends.
     */
    private boolean sharingEnabled = true;
    
    /**
     * Enable duplicate detection.
     */
    private boolean duplicateDetectionEnabled = true;
    
    /**
     * Enable seasonal recommendations.
     */
    private boolean seasonalRecommendationsEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxItemsPerUser() { return maxItemsPerUser; }
    public void setMaxItemsPerUser(int maxItemsPerUser) { this.maxItemsPerUser = maxItemsPerUser; }
    
    public int getMaxOutfitsPerUser() { return maxOutfitsPerUser; }
    public void setMaxOutfitsPerUser(int maxOutfitsPerUser) { this.maxOutfitsPerUser = maxOutfitsPerUser; }
    
    public boolean isArTryOnEnabled() { return arTryOnEnabled; }
    public void setArTryOnEnabled(boolean arTryOnEnabled) { this.arTryOnEnabled = arTryOnEnabled; }
    
    public boolean isStyleRecommendationsEnabled() { return styleRecommendationsEnabled; }
    public void setStyleRecommendationsEnabled(boolean styleRecommendationsEnabled) { 
        this.styleRecommendationsEnabled = styleRecommendationsEnabled; 
    }
    
    public boolean isSharingEnabled() { return sharingEnabled; }
    public void setSharingEnabled(boolean sharingEnabled) { this.sharingEnabled = sharingEnabled; }
    
    public boolean isDuplicateDetectionEnabled() { return duplicateDetectionEnabled; }
    public void setDuplicateDetectionEnabled(boolean duplicateDetectionEnabled) { 
        this.duplicateDetectionEnabled = duplicateDetectionEnabled; 
    }
    
    public boolean isSeasonalRecommendationsEnabled() { return seasonalRecommendationsEnabled; }
    public void setSeasonalRecommendationsEnabled(boolean seasonalRecommendationsEnabled) { 
        this.seasonalRecommendationsEnabled = seasonalRecommendationsEnabled; 
    }
}
