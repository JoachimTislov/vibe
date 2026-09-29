package com.girly.games.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for GamesAgent.
 * 
 * Extends base AgentConfig with games-specific settings.
 */
@ConfigurationProperties("games.agent")
public class GamesAgentConfig extends AgentConfig {
    
    /**
     * Maximum number of concurrent game sessions.
     */
    private int maxConcurrentSessions = 100;
    
    /**
     * Maximum players per game session.
     */
    private int maxPlayersPerSession = 4;
    
    /**
     * Enable multiplayer games.
     */
    private boolean multiplayerEnabled = true;
    
    /**
     * Enable AI opponents.
     */
    private boolean aiOpponentsEnabled = true;
    
    /**
     * Enable leaderboards.
     */
    private boolean leaderboardsEnabled = true;
    
    /**
     * Enable achievements.
     */
    private boolean achievementsEnabled = true;
    
    /**
     * Session timeout in minutes.
     */
    private int sessionTimeoutMinutes = 30;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxConcurrentSessions() { return maxConcurrentSessions; }
    public void setMaxConcurrentSessions(int maxConcurrentSessions) { 
        this.maxConcurrentSessions = maxConcurrentSessions; 
    }
    
    public int getMaxPlayersPerSession() { return maxPlayersPerSession; }
    public void setMaxPlayersPerSession(int maxPlayersPerSession) { 
        this.maxPlayersPerSession = maxPlayersPerSession; 
    }
    
    public boolean isMultiplayerEnabled() { return multiplayerEnabled; }
    public void setMultiplayerEnabled(boolean multiplayerEnabled) { 
        this.multiplayerEnabled = multiplayerEnabled; 
    }
    
    public boolean isAiOpponentsEnabled() { return aiOpponentsEnabled; }
    public void setAiOpponentsEnabled(boolean aiOpponentsEnabled) { 
        this.aiOpponentsEnabled = aiOpponentsEnabled; 
    }
    
    public boolean isLeaderboardsEnabled() { return leaderboardsEnabled; }
    public void setLeaderboardsEnabled(boolean leaderboardsEnabled) { 
        this.leaderboardsEnabled = leaderboardsEnabled; 
    }
    
    public boolean isAchievementsEnabled() { return achievementsEnabled; }
    public void setAchievementsEnabled(boolean achievementsEnabled) { 
        this.achievementsEnabled = achievementsEnabled; 
    }
    
    public int getSessionTimeoutMinutes() { return sessionTimeoutMinutes; }
    public void setSessionTimeoutMinutes(int sessionTimeoutMinutes) { 
        this.sessionTimeoutMinutes = sessionTimeoutMinutes; 
    }
}
