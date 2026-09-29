package com.girly.makeup.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for MakeupAgent.
 * 
 * Extends base AgentConfig with makeup-specific settings.
 */
@ConfigurationProperties("makeup.agent")
public class MakeupAgentConfig extends AgentConfig {
    
    /**
     * Maximum looks per user.
     */
    private int maxLooksPerUser = 200;
    
    /**
     * Maximum products per look.
     */
    private int maxProductsPerLook = 20;
    
    /**
     * Enable AR virtual try-on.
     */
    private boolean arTryOnEnabled = true;
    
    /**
     * Enable AI-powered recommendations.
     */
    private boolean aiRecommendationsEnabled = true;
    
    /**
     * Enable community sharing.
     */
    private boolean communitySharingEnabled = true;
    
    /**
     * Enable skin tone matching.
     */
    private boolean skinToneMatchingEnabled = true;
    
    /**
     * Enable product database.
     */
    private boolean productDatabaseEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxLooksPerUser() { return maxLooksPerUser; }
    public void setMaxLooksPerUser(int maxLooksPerUser) { this.maxLooksPerUser = maxLooksPerUser; }
    
    public int getMaxProductsPerLook() { return maxProductsPerLook; }
    public void setMaxProductsPerLook(int maxProductsPerLook) { 
        this.maxProductsPerLook = maxProductsPerLook; 
    }
    
    public boolean isArTryOnEnabled() { return arTryOnEnabled; }
    public void setArTryOnEnabled(boolean arTryOnEnabled) { this.arTryOnEnabled = arTryOnEnabled; }
    
    public boolean isAiRecommendationsEnabled() { return aiRecommendationsEnabled; }
    public void setAiRecommendationsEnabled(boolean aiRecommendationsEnabled) { 
        this.aiRecommendationsEnabled = aiRecommendationsEnabled; 
    }
    
    public boolean isCommunitySharingEnabled() { return communitySharingEnabled; }
    public void setCommunitySharingEnabled(boolean communitySharingEnabled) { 
        this.communitySharingEnabled = communitySharingEnabled; 
    }
    
    public boolean isSkinToneMatchingEnabled() { return skinToneMatchingEnabled; }
    public void setSkinToneMatchingEnabled(boolean skinToneMatchingEnabled) { 
        this.skinToneMatchingEnabled = skinToneMatchingEnabled; 
    }
    
    public boolean isProductDatabaseEnabled() { return productDatabaseEnabled; }
    public void setProductDatabaseEnabled(boolean productDatabaseEnabled) { 
        this.productDatabaseEnabled = productDatabaseEnabled; 
    }
}
