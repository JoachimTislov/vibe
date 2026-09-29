package com.girly.drama.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for DramaAgent.
 * 
 * Extends base AgentConfig with drama-specific settings.
 */
@ConfigurationProperties("drama.agent")
public class DramaAgentConfig extends AgentConfig {
    
    /**
     * Maximum stories per user.
     */
    private int maxStoriesPerUser = 100;
    
    /**
     * Maximum chapters per story.
     */
    private int maxChaptersPerStory = 50;
    
    /**
     * Maximum characters per story.
     */
    private int maxCharactersPerStory = 50;
    
    /**
     * Maximum content length per chapter (characters).
     */
    private int maxChapterLength = 5000;
    
    /**
     * Enable collaborative storytelling.
     */
    private boolean collaborativeEnabled = true;
    
    /**
     * Enable RPG game mechanics.
     */
    private boolean rpgEnabled = true;
    
    /**
     * Enable AI-assisted writing.
     */
    private boolean aiAssistedWritingEnabled = true;
    
    /**
     * Enable story sharing.
     */
    private boolean sharingEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxStoriesPerUser() { return maxStoriesPerUser; }
    public void setMaxStoriesPerUser(int maxStoriesPerUser) { 
        this.maxStoriesPerUser = maxStoriesPerUser; 
    }
    
    public int getMaxChaptersPerStory() { return maxChaptersPerStory; }
    public void setMaxChaptersPerStory(int maxChaptersPerStory) { 
        this.maxChaptersPerStory = maxChaptersPerStory; 
    }
    
    public int getMaxCharactersPerStory() { return maxCharactersPerStory; }
    public void setMaxCharactersPerStory(int maxCharactersPerStory) { 
        this.maxCharactersPerStory = maxCharactersPerStory; 
    }
    
    public int getMaxChapterLength() { return maxChapterLength; }
    public void setMaxChapterLength(int maxChapterLength) { this.maxChapterLength = maxChapterLength; }
    
    public boolean isCollaborativeEnabled() { return collaborativeEnabled; }
    public void setCollaborativeEnabled(boolean collaborativeEnabled) { 
        this.collaborativeEnabled = collaborativeEnabled; 
    }
    
    public boolean isRpgEnabled() { return rpgEnabled; }
    public void setRpgEnabled(boolean rpgEnabled) { this.rpgEnabled = rpgEnabled; }
    
    public boolean isAiAssistedWritingEnabled() { return aiAssistedWritingEnabled; }
    public void setAiAssistedWritingEnabled(boolean aiAssistedWritingEnabled) { 
        this.aiAssistedWritingEnabled = aiAssistedWritingEnabled; 
    }
    
    public boolean isSharingEnabled() { return sharingEnabled; }
    public void setSharingEnabled(boolean sharingEnabled) { this.sharingEnabled = sharingEnabled; }
}
