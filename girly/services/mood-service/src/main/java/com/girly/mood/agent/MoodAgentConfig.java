package com.girly.mood.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationBuilder;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for MoodAgent.
 * 
 * Extends base AgentConfig with mood-specific settings.
 */
@ConfigurationProperties("mood.agent")
public class MoodAgentConfig extends AgentConfig {
    
    /**
     * Maximum number of mood entries to store per user.
     */
    private int maxEntriesPerUser = 1000;
    
    /**
     * Mood intensity range (e.g., 1-10).
     */
    private int intensityRange = 10;
    
    /**
     * Enable emotion analysis features.
     */
    private boolean emotionAnalysisEnabled = true;
    
    /**
     * Enable trend analysis.
     */
    private boolean trendAnalysisEnabled = true;
    
    /**
     * Enable reflection prompts.
     */
    private boolean reflectionPromptsEnabled = true;
    
    /**
     * Number of days for trend analysis.
     */
    private int trendAnalysisDays = 30;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxEntriesPerUser() { return maxEntriesPerUser; }
    public void setMaxEntriesPerUser(int maxEntriesPerUser) { this.maxEntriesPerUser = maxEntriesPerUser; }
    
    public int getIntensityRange() { return intensityRange; }
    public void setIntensityRange(int intensityRange) { this.intensityRange = intensityRange; }
    
    public boolean isEmotionAnalysisEnabled() { return emotionAnalysisEnabled; }
    public void setEmotionAnalysisEnabled(boolean emotionAnalysisEnabled) { 
        this.emotionAnalysisEnabled = emotionAnalysisEnabled; 
    }
    
    public boolean isTrendAnalysisEnabled() { return trendAnalysisEnabled; }
    public void setTrendAnalysisEnabled(boolean trendAnalysisEnabled) { 
        this.trendAnalysisEnabled = trendAnalysisEnabled; 
    }
    
    public boolean isReflectionPromptsEnabled() { return reflectionPromptsEnabled; }
    public void setReflectionPromptsEnabled(boolean reflectionPromptsEnabled) { 
        this.reflectionPromptsEnabled = reflectionPromptsEnabled; 
    }
    
    public int getTrendAnalysisDays() { return trendAnalysisDays; }
    public void setTrendAnalysisDays(int trendAnalysisDays) { this.trendAnalysisDays = trendAnalysisDays; }
    
    // ==================== Builder Pattern ====================
    
    public static class Builder {
        private final MoodAgentConfig config = new MoodAgentConfig();
        
        public Builder maxEntriesPerUser(int max) { config.maxEntriesPerUser = max; return this; }
        public Builder intensityRange(int range) { config.intensityRange = range; return this; }
        public Builder emotionAnalysisEnabled(boolean enabled) { config.emotionAnalysisEnabled = enabled; return this; }
        public Builder trendAnalysisEnabled(boolean enabled) { config.trendAnalysisEnabled = enabled; return this; }
        public Builder reflectionPromptsEnabled(boolean enabled) { config.reflectionPromptsEnabled = enabled; return this; }
        public Builder trendAnalysisDays(int days) { config.trendAnalysisDays = days; return this; }
        
        public MoodAgentConfig build() {
            return config;
        }
    }
    
    public static Builder builder() {
        return new Builder();
    }
}
