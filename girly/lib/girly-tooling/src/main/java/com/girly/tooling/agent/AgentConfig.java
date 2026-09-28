package com.girly.tooling.agent;

import io.micronaut.context.annotation.ConfigurationBuilder;
import io.micronaut.context.annotation.ConfigurationProperties;
import jakarta.validation.constraints.NotBlank;

import java.util.Map;
import java.util.Set;

/**
 * Base configuration for all Girly agents.
 * 
 * This configuration is extended by service-specific configurations.
 * All agents share these common settings, with services adding their own
 * properties as needed.
 * 
 * Configuration hierarchy:
 * 1. Common settings (this class)
 * 2. Service-specific settings (extending classes)
 * 3. Environment variables
 * 4. Default values
 */
@ConfigurationProperties("girly.agent")
public class AgentConfig {
    
    /**
     * Unique identifier for this agent instance.
     */
    @NotBlank
    private String id = java.util.UUID.randomUUID().toString();
    
    /**
     * Name of this agent.
     */
    @NotBlank
    private String name = "base-agent";
    
    /**
     * Environment (development, staging, production).
     */
    @NotBlank
    private String environment = "development";
    
    /**
     * Version of this agent.
     */
    private String version = "0.1.0";
    
    /**
     * Description of this agent's purpose.
     */
    private String description = "Base Girly agent";
    
    // ==================== Thread Pool Configuration ====================
    
    /**
     * Number of threads for async task execution.
     */
    private int threadPoolSize = 4;
    
    /**
     * Maximum queue size for tasks.
     */
    private int taskQueueSize = 100;
    
    // ==================== Health & Monitoring ====================
    
    /**
     * Health check interval in seconds.
     */
    private long healthCheckInterval = 30;
    
    /**
     * Timeout for health checks in seconds.
     */
    private long healthCheckTimeout = 10;
    
    /**
     * Enable health check logging.
     */
    private boolean healthCheckLogging = true;
    
    // ==================== Metrics ====================
    
    /**
     * Enable metrics collection.
     */
    private boolean metricsEnabled = true;
    
    /**
     * Metrics prefix for this agent.
     */
    private String metricsPrefix = "girly.agent";
    
    // ==================== Logging ====================
    
    /**
     * Log level override (DEBUG, INFO, WARN, ERROR).
     */
    private String logLevel;
    
    /**
     * Enable debug logging.
     */
    private boolean debugEnabled = false;
    
    // ==================== Security ====================
    
    /**
     * Enable security features.
     */
    private boolean securityEnabled = true;
    
    /**
     * API key for external services (if needed).
     */
    private String apiKey;
    
    // ==================== Capabilities ====================
    
    /**
     * Set of capabilities this agent supports.
     * Populated by service-specific implementations.
     */
    private Set<BaseAgent.AgentCapability> capabilities = java.util.EnumSet.noneOf(BaseAgent.AgentCapability.class);
    
    // ==================== Service-Specific Extensions ====================
    
    /**
     * Custom properties that can be set by service-specific configurations.
     * This allows for flexible configuration without requiring code changes.
     */
    private Map<String, Object> customProperties = new java.util.HashMap<>();
    
    // ==================== Getters & Setters ====================
    
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public int getThreadPoolSize() { return threadPoolSize; }
    public void setThreadPoolSize(int threadPoolSize) { this.threadPoolSize = threadPoolSize; }
    
    public int getTaskQueueSize() { return taskQueueSize; }
    public void setTaskQueueSize(int taskQueueSize) { this.taskQueueSize = taskQueueSize; }
    
    public long getHealthCheckInterval() { return healthCheckInterval; }
    public void setHealthCheckInterval(long healthCheckInterval) { 
        this.healthCheckInterval = healthCheckInterval; 
    }
    
    public long getHealthCheckTimeout() { return healthCheckTimeout; }
    public void setHealthCheckTimeout(long healthCheckTimeout) { 
        this.healthCheckTimeout = healthCheckTimeout; 
    }
    
    public boolean isHealthCheckLogging() { return healthCheckLogging; }
    public void setHealthCheckLogging(boolean healthCheckLogging) { 
        this.healthCheckLogging = healthCheckLogging; 
    }
    
    public boolean isMetricsEnabled() { return metricsEnabled; }
    public void setMetricsEnabled(boolean metricsEnabled) { 
        this.metricsEnabled = metricsEnabled; 
    }
    
    public String getMetricsPrefix() { return metricsPrefix; }
    public void setMetricsPrefix(String metricsPrefix) { 
        this.metricsPrefix = metricsPrefix; 
    }
    
    public String getLogLevel() { return logLevel; }
    public void setLogLevel(String logLevel) { this.logLevel = logLevel; }
    
    public boolean isDebugEnabled() { return debugEnabled; }
    public void setDebugEnabled(boolean debugEnabled) { 
        this.debugEnabled = debugEnabled; 
    }
    
    public boolean isSecurityEnabled() { return securityEnabled; }
    public void setSecurityEnabled(boolean securityEnabled) { 
        this.securityEnabled = securityEnabled; 
    }
    
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    
    public Set<BaseAgent.AgentCapability> getCapabilities() { return capabilities; }
    public void setCapabilities(Set<BaseAgent.AgentCapability> capabilities) { 
        this.capabilities = capabilities; 
    }
    
    public Map<String, Object> getCustomProperties() { return customProperties; }
    public void setCustomProperties(Map<String, Object> customProperties) { 
        this.customProperties = customProperties; 
    }
    
    // ==================== Validation ====================
    
    /**
     * Validate that this configuration is valid.
     */
    public void validate() {
        if (id == null || id.isBlank()) {
            throw new IllegalStateException("Agent ID cannot be blank");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalStateException("Agent name cannot be blank");
        }
        if (environment == null || environment.isBlank()) {
            throw new IllegalStateException("Environment cannot be blank");
        }
    }
    
    // ==================== Builder Pattern ====================
    
    /**
     * Builder for AgentConfig.
     */
    public static class Builder {
        private final AgentConfig config = new AgentConfig();
        
        public Builder id(String id) { config.id = id; return this; }
        public Builder name(String name) { config.name = name; return this; }
        public Builder environment(String environment) { config.environment = environment; return this; }
        public Builder version(String version) { config.version = version; return this; }
        public Builder description(String description) { config.description = description; return this; }
        public Builder threadPoolSize(int size) { config.threadPoolSize = size; return this; }
        public Builder taskQueueSize(int size) { config.taskQueueSize = size; return this; }
        public Builder healthCheckInterval(long seconds) { config.healthCheckInterval = seconds; return this; }
        public Builder healthCheckTimeout(long seconds) { config.healthCheckTimeout = seconds; return this; }
        public Builder metricsEnabled(boolean enabled) { config.metricsEnabled = enabled; return this; }
        public Builder metricsPrefix(String prefix) { config.metricsPrefix = prefix; return this; }
        public Builder logLevel(String level) { config.logLevel = level; return this; }
        public Builder debugEnabled(boolean enabled) { config.debugEnabled = enabled; return this; }
        public Builder securityEnabled(boolean enabled) { config.securityEnabled = enabled; return this; }
        public Builder apiKey(String key) { config.apiKey = key; return this; }
        public Builder capabilities(Set<BaseAgent.AgentCapability> capabilities) { 
            config.capabilities = capabilities; 
            return this; 
        }
        public Builder customProperties(Map<String, Object> props) { 
            config.customProperties = props; 
            return this; 
        }
        
        public AgentConfig build() {
            config.validate();
            return config;
        }
    }
    
    public static Builder builder() {
        return new Builder();
    }
}
