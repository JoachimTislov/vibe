package com.girly.journal.agent;

import com.girly.tooling.agent.AgentConfig;
import io.micronaut.context.annotation.ConfigurationProperties;

/**
 * Configuration for JournalAgent.
 * 
 * Extends base AgentConfig with journal-specific settings.
 */
@ConfigurationProperties("journal.agent")
public class JournalAgentConfig extends AgentConfig {
    
    /**
     * Maximum content length for journal entries (characters).
     */
    private int maxContentLength = 10000;
    
    /**
     * Enable encryption for journal entries.
     */
    private boolean encryptionEnabled = true;
    
    /**
     * Enable rich text formatting.
     */
    private boolean richTextEnabled = true;
    
    /**
     * Maximum number of tags per entry.
     */
    private int maxTagsPerEntry = 10;
    
    /**
     * Enable full-text search.
     */
    private boolean fullTextSearchEnabled = true;
    
    // ==================== Getters & Setters ====================
    
    public int getMaxContentLength() { return maxContentLength; }
    public void setMaxContentLength(int maxContentLength) { this.maxContentLength = maxContentLength; }
    
    public boolean isEncryptionEnabled() { return encryptionEnabled; }
    public void setEncryptionEnabled(boolean encryptionEnabled) { this.encryptionEnabled = encryptionEnabled; }
    
    public boolean isRichTextEnabled() { return richTextEnabled; }
    public void setRichTextEnabled(boolean richTextEnabled) { this.richTextEnabled = richTextEnabled; }
    
    public int getMaxTagsPerEntry() { return maxTagsPerEntry; }
    public void setMaxTagsPerEntry(int maxTagsPerEntry) { this.maxTagsPerEntry = maxTagsPerEntry; }
    
    public boolean isFullTextSearchEnabled() { return fullTextSearchEnabled; }
    public void setFullTextSearchEnabled(boolean fullTextSearchEnabled) { 
        this.fullTextSearchEnabled = fullTextSearchEnabled; 
    }
}
