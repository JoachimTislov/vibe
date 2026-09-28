package com.girly.tooling.agent;

import io.micronaut.context.annotation.Value;
import io.micronaut.core.annotation.NonNull;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.TaskScheduler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

/**
 * Base Agent Implementation for Girly Microservices Platform.
 * 
 * This is the foundational agent that all service-specific agents extend.
 * It provides common functionality including lifecycle management, configuration,
 * error handling, and logging that all agents need.
 * 
 * Design Principles:
 * - Single base implementation for consistency across all services
 * - Service-specific agents extend this base with their own configuration
 * - All cross-cutting concerns (logging, metrics, config) handled here
 * - Service-specific logic goes in extending classes
 */
@Singleton
public abstract class BaseAgent {
    
    protected final Logger logger = LoggerFactory.getLogger(getClass());
    
    @Value("${micronaut.application.name:unknown-agent}")
    protected String agentName;
    
    @Value("${girly.agent.id:#{java.util.UUID.randomUUID()}}")
    protected String agentId;
    
    @Value("${girly.agent.environment:development}")
    protected String environment;
    
    @Inject
    protected TaskScheduler taskScheduler;
    
    @Inject
    @NonNull
    @TaskExecutors("agent")
    protected ExecutorService executorService;
    
    protected AgentStatus status = AgentStatus.CREATED;
    protected Instant startedAt;
    protected Instant lastHeartbeat;
    protected int tasksCompleted = 0;
    protected int tasksFailed = 0;
    
    // ==================== Enums ====================
    
    public enum AgentStatus {
        CREATED,
        INITIALIZING,
        READY,
        BUSY,
        DEGRADED,
        STOPPING,
        STOPPED,
        ERROR
    }
    
    public enum AgentCapability {
        // Core capabilities
        AUTHENTICATION,
        DATA_ACCESS,
        EVENT_PROCESSING,
        NOTIFICATION,
        CACHE_MANAGEMENT,
        
        // Emotional support
        MOOD_TRACKING,
        JOURNALING,
        CRISIS_SUPPORT,
        EMOTIONAL_ANALYSIS,
        
        // Social
        FRIEND_MANAGEMENT,
        MESSAGING,
        COMMUNITY_BUILDING,
        MODERATION,
        
        // Creative
        CREATION_TOOLS,
        CUSTOMIZATION,
        SHARING,
        FEEDBACK,
        
        // Practical
        TASK_MANAGEMENT,
        HEALTH_TRACKING,
        GOAL_SETTING,
        DECISION_SUPPORT
    }
    
    // ==================== Lifecycle ====================
    
    /**
     * Called after agent is constructed but before it's ready for use.
     * Override this for service-specific initialization.
     */
    @PostConstruct
    public void initialize() {
        status = AgentStatus.INITIALIZING;
        logger.info("[{}] Initializing agent...", agentName);
        
        try {
            onInitialize();
            status = AgentStatus.READY;
            startedAt = Instant.now();
            lastHeartbeat = startedAt;
            logger.info("[{}] Agent initialized and ready", agentName);
        } catch (Exception e) {
            status = AgentStatus.ERROR;
            logger.error("[{}] Failed to initialize agent", agentName, e);
            throw new AgentInitializationException("Failed to initialize " + agentName, e);
        }
    }
    
    /**
     * Override this method for service-specific initialization logic.
     */
    protected void onInitialize() {
        // Default: no-op. Services override this.
    }
    
    /**
     * Called when agent is being stopped.
     */
    @PreDestroy
    public void stop() {
        status = AgentStatus.STOPPING;
        logger.info("[{}] Stopping agent...", agentName);
        
        try {
            onStop();
            status = AgentStatus.STOPPED;
            logger.info("[{}] Agent stopped", agentName);
        } catch (Exception e) {
            status = AgentStatus.ERROR;
            logger.error("[{}] Failed to stop agent gracefully", agentName, e);
        }
    }
    
    /**
     * Override this method for service-specific cleanup logic.
     */
    protected void onStop() {
        // Default: no-op. Services override this.
    }
    
    // ==================== Status & Health ====================
    
    public AgentStatus getStatus() {
        return status;
    }
    
    public boolean isReady() {
        return status == AgentStatus.READY || status == AgentStatus.BUSY;
    }
    
    public boolean isHealthy() {
        return status == AgentStatus.READY || 
               status == AgentStatus.BUSY || 
               status == AgentStatus.INITIALIZING;
    }
    
    /**
     * Health check for monitoring systems.
     */
    public HealthCheckResult healthCheck() {
        lastHeartbeat = Instant.now();
        
        if (!isHealthy()) {
            return new HealthCheckResult(
                false,
                "Agent is not healthy",
                status.name(),
                Map.of(
                    "status", status.name(),
                    "startedAt", startedAt,
                    "lastHeartbeat", lastHeartbeat,
                    "tasksCompleted", tasksCompleted,
                    "tasksFailed", tasksFailed
                )
            );
        }
        
        return new HealthCheckResult(
            true,
            "Agent is healthy",
            status.name(),
            Map.of(
                "status", status.name(),
                "startedAt", startedAt,
                "lastHeartbeat", lastHeartbeat,
                "uptime", calculateUptime(),
                "tasksCompleted", tasksCompleted,
                "tasksFailed", tasksFailed
            )
        );
    }
    
    private String calculateUptime() {
        if (startedAt == null) {
            return "N/A";
        }
        return java.time.Duration.between(startedAt, Instant.now()).toString();
    }
    
    // ==================== Task Execution ====================
    
    /**
     * Execute a task asynchronously.
     */
    public <T> CompletableFuture<T> executeAsync(AgentTask<T> task) {
        tasksCompleted++;
        status = AgentStatus.BUSY;
        
        logger.debug("[{}] Executing task: {}", agentName, task.getName());
        
        return CompletableFuture.supplyAsync(() -> {
            try {
                return task.execute();
            } catch (Exception e) {
                tasksFailed++;
                logger.error("[{}] Task failed: {}", agentName, task.getName(), e);
                throw new AgentExecutionException("Task " + task.getName() + " failed", e);
            } finally {
                status = AgentStatus.READY;
            }
        }, executorService)
        .whenComplete((result, error) -> {
            if (error != null) {
                logger.error("[{}] Task completed with error: {}", agentName, task.getName(), error);
            } else {
                logger.debug("[{}] Task completed successfully: {}", agentName, task.getName());
            }
        });
    }
    
    /**
     * Execute a task synchronously.
     */
    public <T> T executeSync(AgentTask<T> task) {
        tasksCompleted++;
        status = AgentStatus.BUSY;
        
        logger.debug("[{}] Executing synchronous task: {}", agentName, task.getName());
        
        try {
            T result = task.execute();
            status = AgentStatus.READY;
            return result;
        } catch (Exception e) {
            tasksFailed++;
            status = AgentStatus.READY;
            logger.error("[{}] Synchronous task failed: {}", agentName, task.getName(), e);
            throw new AgentExecutionException("Task " + task.getName() + " failed", e);
        }
    }
    
    // ==================== Scheduling ====================
    
    /**
     * Schedule a task to run at a fixed rate.
     */
    public ScheduledTask scheduleAtFixedRate(
            AgentTask<?> task,
            long initialDelay,
            long period,
            java.util.concurrent.TimeUnit unit) {
        
        ScheduledTask scheduledTask = new ScheduledTask(
            task.getName(),
            task,
            initialDelay,
            period,
            unit
        );
        
        taskScheduler.scheduleAtFixedRate(
            scheduledTask.getName(),
            () -> executeAsync(task),
            initialDelay,
            period,
            unit
        );
        
        logger.info("[{}] Scheduled task '{}' at fixed rate: every {} {}", 
                    agentName, task.getName(), period, unit);
        
        return scheduledTask;
    }
    
    /**
     * Schedule a task to run with a fixed delay.
     */
    public ScheduledTask scheduleWithFixedDelay(
            AgentTask<?> task,
            long initialDelay,
            long delay,
            java.util.concurrent.TimeUnit unit) {
        
        ScheduledTask scheduledTask = new ScheduledTask(
            task.getName(),
            task,
            initialDelay,
            delay,
            unit
        );
        
        taskScheduler.scheduleWithFixedDelay(
            scheduledTask.getName(),
            () -> executeAsync(task),
            initialDelay,
            delay,
            unit
        );
        
        logger.info("[{}] Scheduled task '{}' with fixed delay: {} {} after completion", 
                    agentName, task.getName(), delay, unit);
        
        return scheduledTask;
    }
    
    // ==================== Capability Management ====================
    
    /**
     * Check if this agent supports a specific capability.
     */
    public boolean hasCapability(AgentCapability capability) {
        return getCapabilities().contains(capability);
    }
    
    /**
     * Get all capabilities supported by this agent.
     * Override in service-specific agents.
     */
    protected java.util.Set<AgentCapability> getCapabilities() {
        return java.util.Set.of();
    }
    
    // ==================== Configuration ====================
    
    public String getAgentName() {
        return agentName;
    }
    
    public String getAgentId() {
        return agentId;
    }
    
    public String getEnvironment() {
        return environment;
    }
    
    // ==================== Inner Classes ====================
    
    /**
     * Represents a task that can be executed by an agent.
     */
    public interface AgentTask<T> {
        String getName();
        T execute() throws Exception;
    }
    
    /**
     * Health check result for monitoring.
     */
    public static class HealthCheckResult {
        private final boolean healthy;
        private final String message;
        private final String status;
        private final java.util.Map<String, Object> details;
        
        public HealthCheckResult(boolean healthy, String message, String status, 
                               java.util.Map<String, Object> details) {
            this.healthy = healthy;
            this.message = message;
            this.status = status;
            this.details = details;
        }
        
        public boolean isHealthy() { return healthy; }
        public String getMessage() { return message; }
        public String getStatus() { return status; }
        public java.util.Map<String, Object> getDetails() { return details; }
    }
    
    /**
     * Represents a scheduled task.
     */
    public static class ScheduledTask {
        private final String name;
        private final AgentTask<?> task;
        private final long initialDelay;
        private final long periodOrDelay;
        private final java.util.concurrent.TimeUnit unit;
        
        public ScheduledTask(String name, AgentTask<?> task, long initialDelay, 
                          long periodOrDelay, java.util.concurrent.TimeUnit unit) {
            this.name = name;
            this.task = task;
            this.initialDelay = initialDelay;
            this.periodOrDelay = periodOrDelay;
            this.unit = unit;
        }
        
        public String getName() { return name; }
        public AgentTask<?> getTask() { return task; }
    }
    
    // ==================== Exception Classes ====================
    
    public static class AgentInitializationException extends RuntimeException {
        public AgentInitializationException(String message) {
            super(message);
        }
        public AgentInitializationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
    
    public static class AgentExecutionException extends RuntimeException {
        public AgentExecutionException(String message) {
            super(message);
        }
        public AgentExecutionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
    
    // ==================== Utility Methods ====================
    
    protected void logInfo(String message, Object... args) {
        logger.info("[{}] {}", new Object[]{
            agentName, 
            String.format(message, args)
        });
    }
    
    protected void logError(String message, Throwable error, Object... args) {
        logger.error("[{}] {}", new Object[]{
            agentName, 
            String.format(message, args)
        }, error);
    }
    
    protected void logDebug(String message, Object... args) {
        logger.debug("[{}] {}", new Object[]{
            agentName, 
            String.format(message, args)
        });
    }
}
