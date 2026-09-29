package com.girly.health.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for HealthAgent.
 * 
 * Extends base AgentConfig with health-specific settings.
 */
@ConfigurationProperties("health.agent")
public class HealthAgentConfig extends AgentConfig {
    
    /**
     * Maximum period history in months.
     */
    private int maxPeriodHistoryMonths = 24;
    
    /**
     * Enable period predictions.
     */
    private boolean predictionsEnabled = true;
    
    /**
     * Enable ovulation tracking.
     */
    private boolean ovulationTrackingEnabled = true;
    
    /**
     * Enable symptom tracking.
     */
    private boolean symptomTrackingEnabled = true;
    
    /**
     * Enable wellness insights.
     */
    private boolean wellnessInsightsEnabled = true;
    
    /**
     * Enable health reminders.
     */
    private boolean remindersEnabled = true;
    
    /**
     * Enable data export.
     */
    private boolean exportEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxPeriodHistoryMonths() { return maxPeriodHistoryMonths; }
    public void setMaxPeriodHistoryMonths(int maxPeriodHistoryMonths) { 
        this.maxPeriodHistoryMonths = maxPeriodHistoryMonths; 
    }
    
    public boolean isPredictionsEnabled() { return predictionsEnabled; }
    public void setPredictionsEnabled(boolean predictionsEnabled) { 
        this.predictionsEnabled = predictionsEnabled; 
    }
    
    public boolean isOvulationTrackingEnabled() { return ovulationTrackingEnabled; }
    public void setOvulationTrackingEnabled(boolean ovulationTrackingEnabled) { 
        this.ovulationTrackingEnabled = ovulationTrackingEnabled; 
    }
    
    public boolean isSymptomTrackingEnabled() { return symptomTrackingEnabled; }
    public void setSymptomTrackingEnabled(boolean symptomTrackingEnabled) { 
        this.symptomTrackingEnabled = symptomTrackingEnabled; 
    }
    
    public boolean isWellnessInsightsEnabled() { return wellnessInsightsEnabled; }
    public void setWellnessInsightsEnabled(boolean wellnessInsightsEnabled) { 
        this.wellnessInsightsEnabled = wellnessInsightsEnabled; 
    }
    
    public boolean isRemindersEnabled() { return remindersEnabled; }
    public void setRemindersEnabled(boolean remindersEnabled) { 
        this.remindersEnabled = remindersEnabled; 
    }
    
    public boolean isExportEnabled() { return exportEnabled; }
    public void setExportEnabled(boolean exportEnabled) { this.exportEnabled = exportEnabled; }
}
