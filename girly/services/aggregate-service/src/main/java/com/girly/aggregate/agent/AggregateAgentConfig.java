package com.girly.aggregate.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for AggregateAgent.
 * 
 * Extends base AgentConfig with aggregation-specific settings.
 */
@ConfigurationProperties("aggregate.agent")
public class AggregateAgentConfig extends AgentConfig {
    
    /**
     * Aggregation interval in hours.
     */
    private int aggregationIntervalHours = 24;
    
    /**
     * Maximum aggregation history in days.
     */
    private int maxHistoryDays = 30;
    
    /**
     * Enable dashboard generation.
     */
    private boolean dashboardEnabled = true;
    
    /**
     * Enable platform insights.
     */
    private boolean platformInsightsEnabled = true;
    
    /**
     * Enable personalized recommendations.
     */
    private boolean recommendationsEnabled = true;
    
    /**
     * Enable cross-service analytics.
     */
    private boolean analyticsEnabled = true;
    
    /**
     * Enable data export.
     */
    private boolean exportEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getAggregationIntervalHours() { return aggregationIntervalHours; }
    public void setAggregationIntervalHours(int aggregationIntervalHours) { 
        this.aggregationIntervalHours = aggregationIntervalHours; 
    }
    
    public int getMaxHistoryDays() { return maxHistoryDays; }
    public void setMaxHistoryDays(int maxHistoryDays) { this.maxHistoryDays = maxHistoryDays; }
    
    public boolean isDashboardEnabled() { return dashboardEnabled; }
    public void setDashboardEnabled(boolean dashboardEnabled) { 
        this.dashboardEnabled = dashboardEnabled; 
    }
    
    public boolean isPlatformInsightsEnabled() { return platformInsightsEnabled; }
    public void setPlatformInsightsEnabled(boolean platformInsightsEnabled) { 
        this.platformInsightsEnabled = platformInsightsEnabled; 
    }
    
    public boolean isRecommendationsEnabled() { return recommendationsEnabled; }
    public void setRecommendationsEnabled(boolean recommendationsEnabled) { 
        this.recommendationsEnabled = recommendationsEnabled; 
    }
    
    public boolean isAnalyticsEnabled() { return analyticsEnabled; }
    public void setAnalyticsEnabled(boolean analyticsEnabled) { 
        this.analyticsEnabled = analyticsEnabled; 
    }
    
    public boolean isExportEnabled() { return exportEnabled; }
    public void setExportEnabled(boolean exportEnabled) { this.exportEnabled = exportEnabled; }
}
