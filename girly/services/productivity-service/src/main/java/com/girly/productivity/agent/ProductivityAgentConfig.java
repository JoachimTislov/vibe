package com.girly.productivity.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for ProductivityAgent.
 * 
 * Extends base AgentConfig with productivity-specific settings.
 */
@ConfigurationProperties("productivity.agent")
public class ProductivityAgentConfig extends AgentConfig {
    
    /**
     * Maximum tasks per user.
     */
    private int maxTasksPerUser = 1000;
    
    /**
     * Maximum habits per user.
     */
    private int maxHabitsPerUser = 100;
    
    /**
     * Maximum goals per user.
     */
    private int maxGoalsPerUser = 50;
    
    /**
     * Enable recurring tasks.
     */
    private boolean recurringTasksEnabled = true;
    
    /**
     * Enable subtasks.
     */
    private boolean subtasksEnabled = true;
    
    /**
     * Enable habit streaks.
     */
    private boolean habitStreaksEnabled = true;
    
    /**
     * Enable goal tracking.
     */
    private boolean goalTrackingEnabled = true;
    
    /**
     * Enable reminders.
     */
    private boolean remindersEnabled = true;
    
    /**
     * Enable progress analytics.
     */
    private boolean analyticsEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxTasksPerUser() { return maxTasksPerUser; }
    public void setMaxTasksPerUser(int maxTasksPerUser) { 
        this.maxTasksPerUser = maxTasksPerUser; 
    }
    
    public int getMaxHabitsPerUser() { return maxHabitsPerUser; }
    public void setMaxHabitsPerUser(int maxHabitsPerUser) { 
        this.maxHabitsPerUser = maxHabitsPerUser; 
    }
    
    public int getMaxGoalsPerUser() { return maxGoalsPerUser; }
    public void setMaxGoalsPerUser(int maxGoalsPerUser) { 
        this.maxGoalsPerUser = maxGoalsPerUser; 
    }
    
    public boolean isRecurringTasksEnabled() { return recurringTasksEnabled; }
    public void setRecurringTasksEnabled(boolean recurringTasksEnabled) { 
        this.recurringTasksEnabled = recurringTasksEnabled; 
    }
    
    public boolean isSubtasksEnabled() { return subtasksEnabled; }
    public void setSubtasksEnabled(boolean subtasksEnabled) { 
        this.subtasksEnabled = subtasksEnabled; 
    }
    
    public boolean isHabitStreaksEnabled() { return habitStreaksEnabled; }
    public void setHabitStreaksEnabled(boolean habitStreaksEnabled) { 
        this.habitStreaksEnabled = habitStreaksEnabled; 
    }
    
    public boolean isGoalTrackingEnabled() { return goalTrackingEnabled; }
    public void setGoalTrackingEnabled(boolean goalTrackingEnabled) { 
        this.goalTrackingEnabled = goalTrackingEnabled; 
    }
    
    public boolean isRemindersEnabled() { return remindersEnabled; }
    public void setRemindersEnabled(boolean remindersEnabled) { 
        this.remindersEnabled = remindersEnabled; 
    }
    
    public boolean isAnalyticsEnabled() { return analyticsEnabled; }
    public void setAnalyticsEnabled(boolean analyticsEnabled) { 
        this.analyticsEnabled = analyticsEnabled; 
    }
}
