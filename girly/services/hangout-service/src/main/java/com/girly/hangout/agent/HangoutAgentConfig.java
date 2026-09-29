package com.girly.hangout.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for HangoutAgent.
 * 
 * Extends base AgentConfig with hangout-specific settings.
 */
@ConfigurationProperties("hangout.agent")
public class HangoutAgentConfig extends AgentConfig {
    
    /**
     * Maximum number of concurrent rooms.
     */
    private int maxConcurrentRooms = 50;
    
    /**
     * Maximum participants per room.
     */
    private int maxParticipantsPerRoom = 8;
    
    /**
     * Enable video chat.
     */
    private boolean videoEnabled = true;
    
    /**
     * Enable screen sharing.
     */
    private boolean screenSharingEnabled = true;
    
    /**
     * Enable chat.
     */
    private boolean chatEnabled = true;
    
    /**
     * Enable group activities.
     */
    private boolean groupActivitiesEnabled = true;
    
    /**
     * Enable safety monitoring.
     */
    private boolean safetyMonitoringEnabled = true;
    
    /**
     * Room timeout in hours.
     */
    private int roomTimeoutHours = 4;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxConcurrentRooms() { return maxConcurrentRooms; }
    public void setMaxConcurrentRooms(int maxConcurrentRooms) { 
        this.maxConcurrentRooms = maxConcurrentRooms; 
    }
    
    public int getMaxParticipantsPerRoom() { return maxParticipantsPerRoom; }
    public void setMaxParticipantsPerRoom(int maxParticipantsPerRoom) { 
        this.maxParticipantsPerRoom = maxParticipantsPerRoom; 
    }
    
    public boolean isVideoEnabled() { return videoEnabled; }
    public void setVideoEnabled(boolean videoEnabled) { this.videoEnabled = videoEnabled; }
    
    public boolean isScreenSharingEnabled() { return screenSharingEnabled; }
    public void setScreenSharingEnabled(boolean screenSharingEnabled) { 
        this.screenSharingEnabled = screenSharingEnabled; 
    }
    
    public boolean isChatEnabled() { return chatEnabled; }
    public void setChatEnabled(boolean chatEnabled) { this.chatEnabled = chatEnabled; }
    
    public boolean isGroupActivitiesEnabled() { return groupActivitiesEnabled; }
    public void setGroupActivitiesEnabled(boolean groupActivitiesEnabled) { 
        this.groupActivitiesEnabled = groupActivitiesEnabled; 
    }
    
    public boolean isSafetyMonitoringEnabled() { return safetyMonitoringEnabled; }
    public void setSafetyMonitoringEnabled(boolean safetyMonitoringEnabled) { 
        this.safetyMonitoringEnabled = safetyMonitoringEnabled; 
    }
    
    public int getRoomTimeoutHours() { return roomTimeoutHours; }
    public void setRoomTimeoutHours(int roomTimeoutHours) { 
        this.roomTimeoutHours = roomTimeoutHours; 
    }
}
