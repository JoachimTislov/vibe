package com.girly.social.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for SocialAgent.
 * 
 * Extends base AgentConfig with social-specific settings.
 */
@ConfigurationProperties("social.agent")
public class SocialAgentConfig extends AgentConfig {
    
    /**
     * Maximum number of friends per user.
     */
    private int maxFriendsPerUser = 500;
    
    /**
     * Maximum message length (characters).
     */
    private int maxMessageLength = 1000;
    
    /**
     * Enable friend requests.
     */
    private boolean friendRequestsEnabled = true;
    
    /**
     * Enable group chats.
     */
    private boolean groupChatsEnabled = true;
    
    /**
     * Maximum group size.
     */
    private int maxGroupSize = 10;
    
    /**
     * Enable moderation features.
     */
    private boolean moderationEnabled = true;
    
    /**
     * Enable privacy controls.
     */
    private boolean privacyControlsEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxFriendsPerUser() { return maxFriendsPerUser; }
    public void setMaxFriendsPerUser(int maxFriendsPerUser) { this.maxFriendsPerUser = maxFriendsPerUser; }
    
    public int getMaxMessageLength() { return maxMessageLength; }
    public void setMaxMessageLength(int maxMessageLength) { this.maxMessageLength = maxMessageLength; }
    
    public boolean isFriendRequestsEnabled() { return friendRequestsEnabled; }
    public void setFriendRequestsEnabled(boolean friendRequestsEnabled) { 
        this.friendRequestsEnabled = friendRequestsEnabled; 
    }
    
    public boolean isGroupChatsEnabled() { return groupChatsEnabled; }
    public void setGroupChatsEnabled(boolean groupChatsEnabled) { this.groupChatsEnabled = groupChatsEnabled; }
    
    public int getMaxGroupSize() { return maxGroupSize; }
    public void setMaxGroupSize(int maxGroupSize) { this.maxGroupSize = maxGroupSize; }
    
    public boolean isModerationEnabled() { return moderationEnabled; }
    public void setModerationEnabled(boolean moderationEnabled) { this.moderationEnabled = moderationEnabled; }
    
    public boolean isPrivacyControlsEnabled() { return privacyControlsEnabled; }
    public void setPrivacyControlsEnabled(boolean privacyControlsEnabled) { 
        this.privacyControlsEnabled = privacyControlsEnabled; 
    }
}
