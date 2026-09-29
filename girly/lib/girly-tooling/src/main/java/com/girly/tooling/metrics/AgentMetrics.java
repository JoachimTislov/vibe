package com.girly.tooling.metrics;

import com.girly.tooling.agent.BaseAgent;
import jakarta.inject.Singleton;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Agent Metrics - Centralized metrics collection for all girly agents.
 * 
 * This is a CENTRALIZED tooling component that provides:
 * - Metrics collection and aggregation
 * - Performance monitoring
 * - Usage analytics
 * - Health metrics
 * 
 * All services use this for metrics to ensure consistent monitoring
 * across the entire platform.
 */
@Singleton
public class AgentMetrics {
    
    // ==================== Metrics Storage ====================
    
    // Request counters
    private final Map<String, AtomicLong> requestCounters = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> errorCounters = new ConcurrentHashMap<>();
    
    // Timing metrics
    private final Map<String, List<Long>> responseTimes = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> totalProcessingTime = new ConcurrentHashMap<>();
    
    // Agent-specific metrics
    private final Map<String, AgentMetricsData> agentMetrics = new ConcurrentHashMap<>();
    
    // Rate limiting tracking
    private final Map<String, RateLimitTracker> rateLimitTrackers = new ConcurrentHashMap<>();
    
    // Configuration
    private boolean metricsEnabled = true;
    private int maxTimingSamples = 1000;
    private long metricsRetentionSeconds = 3600; // 1 hour
    
    // ==================== Metrics Data Classes ====================
    
    /**
     * Metrics data for a specific agent.
     */
    public static class AgentMetricsData {
        private final String agentName;
        private final AtomicLong requestsProcessed = new AtomicLong(0);
        private final AtomicLong errors = new AtomicLong(0);
        private final AtomicLong tasksCompleted = new AtomicLong(0);
        private final AtomicLong tasksFailed = new AtomicLong(0);
        private final AtomicLong activeTasks = new AtomicLong(0);
        private final Map<String, AtomicLong> capabilityUsage = new ConcurrentHashMap<>();
        private Instant startedAt;
        private Instant lastActivity;
        
        public AgentMetricsData(String agentName) {
            this.agentName = agentName;
            this.startedAt = Instant.now();
            this.lastActivity = startedAt;
        }
        
        public String getAgentName() { return agentName; }
        public long getRequestsProcessed() { return requestsProcessed.get(); }
        public long getErrors() { return errors.get(); }
        public long getTasksCompleted() { return tasksCompleted.get(); }
        public long getTasksFailed() { return tasksFailed.get(); }
        public long getActiveTasks() { return activeTasks.get(); }
        public Instant getStartedAt() { return startedAt; }
        public Instant getLastActivity() { return lastActivity; }
        public Map<String, Long> getCapabilityUsage() {
            Map<String, Long> result = new HashMap<>();
            capabilityUsage.forEach((k, v) -> result.put(k, v.get()));
            return result;
        }
        
        public void incrementRequests() { requestsProcessed.incrementAndGet(); }
        public void incrementErrors() { errors.incrementAndGet(); }
        public void incrementTasksCompleted() { tasksCompleted.incrementAndGet(); }
        public void incrementTasksFailed() { tasksFailed.incrementAndGet(); }
        public void incrementActiveTasks() { activeTasks.incrementAndGet(); }
        public void decrementActiveTasks() { activeTasks.decrementAndGet(); }
        public void incrementCapabilityUsage(String capability) {
            capabilityUsage.computeIfAbsent(capability, k -> new AtomicLong(0))
                           .incrementAndGet();
        }
        public void updateLastActivity() { lastActivity = Instant.now(); }
    }
    
    /**
     * Rate limit tracking data.
     */
    private static class RateLimitTracker {
        private final Deque<Instant> requestTimestamps = new LinkedList<>();
        private final long windowSeconds;
        private final long maxRequests;
        
        public RateLimitTracker(long maxRequests, long windowSeconds) {
            this.maxRequests = maxRequests;
            this.windowSeconds = windowSeconds;
        }
        
        public boolean isRateLimited() {
            Instant now = Instant.now();
            Instant cutoff = now.minusSeconds(windowSeconds);
            
            // Remove old requests
            while (!requestTimestamps.isEmpty() && 
                   requestTimestamps.peekFirst().isBefore(cutoff)) {
                requestTimestamps.pollFirst();
            }
            
            return requestTimestamps.size() >= maxRequests;
        }
        
        public void recordRequest() {
            Instant now = Instant.now();
            Instant cutoff = now.minusSeconds(windowSeconds);
            
            // Remove old requests
            while (!requestTimestamps.isEmpty() && 
                   requestTimestamps.peekFirst().isBefore(cutoff)) {
                requestTimestamps.pollFirst();
            }
            
            requestTimestamps.addLast(now);
        }
        
        public long getRemainingRequests() {
            Instant now = Instant.now();
            Instant cutoff = now.minusSeconds(windowSeconds);
            
            // Remove old requests
            while (!requestTimestamps.isEmpty() && 
                   requestTimestamps.peekFirst().isBefore(cutoff)) {
                requestTimestamps.pollFirst();
            }
            
            return Math.max(0, maxRequests - requestTimestamps.size());
        }
        
        public long getResetTimeSeconds() {
            Instant now = Instant.now();
            Instant cutoff = now.minusSeconds(windowSeconds);
            
            // Remove old requests
            while (!requestTimestamps.isEmpty() && 
                   requestTimestamps.peekFirst().isBefore(cutoff)) {
                requestTimestamps.pollFirst();
            }
            
            if (requestTimestamps.isEmpty()) {
                return 0; // No waiting needed
            }
            
            Instant oldest = requestTimestamps.peekFirst();
            Instant resetTime = oldest.plusSeconds(windowSeconds);
            return Math.max(0, java.time.Duration.between(now, resetTime).getSeconds());
        }
    }
    
    // ==================== Request Metrics ====================
    
    /**
     * Record a request for a specific endpoint or operation.
     */
    public void recordRequest(String endpoint) {
        if (!metricsEnabled) return;
        
        requestCounters.computeIfAbsent(endpoint, k -> new AtomicLong(0))
                       .incrementAndGet();
    }
    
    /**
     * Record an error for a specific endpoint or operation.
     */
    public void recordError(String endpoint) {
        if (!metricsEnabled) return;
        
        errorCounters.computeIfAbsent(endpoint, k -> new AtomicLong(0))
                      .incrementAndGet();
    }
    
    /**
     * Record the processing time for a request.
     */
    public void recordRequestTime(String endpoint, long milliseconds) {
        if (!metricsEnabled) return;
        
        // Add to list for percentiles
        responseTimes.computeIfAbsent(endpoint, k -> new ArrayList<>())
                     .add(milliseconds);
        
        // Keep list size bounded
        List<Long> times = responseTimes.get(endpoint);
        if (times.size() > maxTimingSamples) {
            times.remove(0); // Remove oldest
        }
        
        // Update total
        totalProcessingTime.computeIfAbsent(endpoint, k -> new AtomicLong(0))
                           .addAndGet(milliseconds);
    }
    
    /**
     * Get metrics for a specific endpoint.
     */
    public EndpointMetrics getEndpointMetrics(String endpoint) {
        long requests = requestCounters.getOrDefault(endpoint, new AtomicLong(0)).get();
        long errors = errorCounters.getOrDefault(endpoint, new AtomicLong(0)).get();
        long totalTime = totalProcessingTime.getOrDefault(endpoint, new AtomicLong(0)).get();
        
        List<Long> times = responseTimes.getOrDefault(endpoint, new ArrayList<>());
        
        double avgTime = requests > 0 ? (totalTime * 1.0 / requests) : 0;
        double errorRate = requests > 0 ? (errors * 100.0 / requests) : 0;
        
        // Calculate percentiles
        Collections.sort(times);
        long p50 = times.size() > 0 ? times.get((int) (times.size() * 0.5)) : 0;
        long p95 = times.size() > 0 ? times.get((int) (times.size() * 0.95)) : 0;
        long p99 = times.size() > 0 ? times.get((int) (times.size() * 0.99)) : 0;
        
        return new EndpointMetrics(endpoint, requests, errors, avgTime, errorRate, p50, p95, p99);
    }
    
    // ==================== Agent Metrics ====================
    
    /**
     * Register an agent for metrics tracking.
     */
    public void registerAgent(String agentName) {
        agentMetrics.computeIfAbsent(agentName, AgentMetricsData::new);
    }
    
    /**
     * Record a request for an agent.
     */
    public void recordAgentRequest(String agentName) {
        if (!metricsEnabled) return;
        
        AgentMetricsData data = agentMetrics.computeIfAbsent(agentName, AgentMetricsData::new);
        data.incrementRequests();
        data.updateLastActivity();
    }
    
    /**
     * Record an error for an agent.
     */
    public void recordAgentError(String agentName) {
        if (!metricsEnabled) return;
        
        AgentMetricsData data = agentMetrics.computeIfAbsent(agentName, AgentMetricsData::new);
        data.incrementErrors();
        data.updateLastActivity();
    }
    
    /**
     * Record a task completion for an agent.
     */
    public void recordAgentTask(String agentName, boolean success, String capability) {
        if (!metricsEnabled) return;
        
        AgentMetricsData data = agentMetrics.computeIfAbsent(agentName, AgentMetricsData::new);
        
        if (success) {
            data.incrementTasksCompleted();
        } else {
            data.incrementTasksFailed();
        }
        
        if (capability != null && !capability.isEmpty()) {
            data.incrementCapabilityUsage(capability);
        }
        
        data.updateLastActivity();
    }
    
    /**
     * Record active task count for an agent.
     */
    public void recordActiveTasks(String agentName, int count) {
        if (!metricsEnabled) return;
        
        AgentMetricsData data = agentMetrics.computeIfAbsent(agentName, AgentMetricsData::new);
        long current = data.getActiveTasks();
        
        if (count > current) {
            for (long i = current; i < count; i++) {
                data.incrementActiveTasks();
            }
        } else if (count < current) {
            for (long i = current; i > count; i--) {
                data.decrementActiveTasks();
            }
        }
    }
    
    /**
     * Get metrics for a specific agent.
     */
    public AgentMetricsData getAgentMetrics(String agentName) {
        return agentMetrics.get(agentName);
    }
    
    /**
     * Get metrics for all agents.
     */
    public Map<String, AgentMetricsData> getAllAgentMetrics() {
        return Collections.unmodifiableMap(agentMetrics);
    }
    
    // ==================== Rate Limiting ====================
    
    /**
     * Check if a rate limit has been exceeded.
     */
    public boolean isRateLimited(String key, long maxRequests, long windowSeconds) {
        if (!metricsEnabled) return false;
        
        RateLimitTracker tracker = rateLimitTrackers.computeIfAbsent(
            key, 
            k -> new RateLimitTracker(maxRequests, windowSeconds)
        );
        
        return tracker.isRateLimited();
    }
    
    /**
     * Record a request for rate limiting purposes.
     */
    public void recordRateLimitRequest(String key, long maxRequests, long windowSeconds) {
        if (!metricsEnabled) return;
        
        RateLimitTracker tracker = rateLimitTrackers.computeIfAbsent(
            key, 
            k -> new RateLimitTracker(maxRequests, windowSeconds)
        );
        
        tracker.recordRequest();
    }
    
    /**
     * Check rate limit status.
     */
    public RateLimitStatus checkRateLimit(String key, long maxRequests, long windowSeconds) {
        RateLimitTracker tracker = rateLimitTrackers.computeIfAbsent(
            key, 
            k -> new RateLimitTracker(maxRequests, windowSeconds)
        );
        
        boolean isLimited = tracker.isRateLimited();
        long remaining = tracker.getRemainingRequests();
        long resetSeconds = tracker.getResetTimeSeconds();
        
        return new RateLimitStatus(isLimited, remaining, resetSeconds);
    }
    
    // ==================== Aggregate Metrics ====================
    
    /**
     * Get overall platform metrics.
     */
    public PlatformMetrics getPlatformMetrics() {
        long totalRequests = requestCounters.values().stream()
                .mapToLong(AtomicLong::get)
                .sum();
        
        long totalErrors = errorCounters.values().stream()
                .mapToLong(AtomicLong::get)
                .sum();
        
        long totalAgentRequests = agentMetrics.values().stream()
                .mapToLong(AgentMetricsData::getRequestsProcessed)
                .sum();
        
        long totalAgentErrors = agentMetrics.values().stream()
                .mapToLong(AgentMetricsData::getErrors)
                .sum();
        
        return new PlatformMetrics(
            totalRequests,
            totalErrors,
            totalAgentRequests,
            totalAgentErrors,
            agentMetrics.size()
        );
    }
    
    // ==================== Configuration ====================
    
    public boolean isMetricsEnabled() {
        return metricsEnabled;
    }
    
    public void setMetricsEnabled(boolean metricsEnabled) {
        this.metricsEnabled = metricsEnabled;
    }
    
    public int getMaxTimingSamples() {
        return maxTimingSamples;
    }
    
    public void setMaxTimingSamples(int maxTimingSamples) {
        this.maxTimingSamples = maxTimingSamples;
    }
    
    public long getMetricsRetentionSeconds() {
        return metricsRetentionSeconds;
    }
    
    public void setMetricsRetentionSeconds(long metricsRetentionSeconds) {
        this.metricsRetentionSeconds = metricsRetentionSeconds;
    }
    
    // ==================== Metrics Result Classes ====================
    
    /**
     * Metrics for a specific endpoint.
     */
    public static class EndpointMetrics {
        private final String endpoint;
        private final long requests;
        private final long errors;
        private final double averageTimeMs;
        private final double errorRate;
        private final long p50Ms;
        private final long p95Ms;
        private final long p99Ms;
        
        public EndpointMetrics(String endpoint, long requests, long errors, 
                              double averageTimeMs, double errorRate,
                              long p50Ms, long p95Ms, long p99Ms) {
            this.endpoint = endpoint;
            this.requests = requests;
            this.errors = errors;
            this.averageTimeMs = averageTimeMs;
            this.errorRate = errorRate;
            this.p50Ms = p50Ms;
            this.p95Ms = p95Ms;
            this.p99Ms = p99Ms;
        }
        
        public String getEndpoint() { return endpoint; }
        public long getRequests() { return requests; }
        public long getErrors() { return errors; }
        public double getAverageTimeMs() { return averageTimeMs; }
        public double getErrorRate() { return errorRate; }
        public long getP50Ms() { return p50Ms; }
        public long getP95Ms() { return p95Ms; }
        public long getP99Ms() { return p99Ms; }
    }
    
    /**
     * Rate limit status.
     */
    public static class RateLimitStatus {
        private final boolean rateLimited;
        private final long remainingRequests;
        private final long resetTimeSeconds;
        
        public RateLimitStatus(boolean rateLimited, long remainingRequests, long resetTimeSeconds) {
            this.rateLimited = rateLimited;
            this.remainingRequests = remainingRequests;
            this.resetTimeSeconds = resetTimeSeconds;
        }
        
        public boolean isRateLimited() { return rateLimited; }
        public long getRemainingRequests() { return remainingRequests; }
        public long getResetTimeSeconds() { return resetTimeSeconds; }
    }
    
    /**
     * Overall platform metrics.
     */
    public static class PlatformMetrics {
        private final long totalRequests;
        private final long totalErrors;
        private final long totalAgentRequests;
        private final long totalAgentErrors;
        private final int activeAgents;
        
        public PlatformMetrics(long totalRequests, long totalErrors,
                              long totalAgentRequests, long totalAgentErrors,
                              int activeAgents) {
            this.totalRequests = totalRequests;
            this.totalErrors = totalErrors;
            this.totalAgentRequests = totalAgentRequests;
            this.totalAgentErrors = totalAgentErrors;
            this.activeAgents = activeAgents;
        }
        
        public long getTotalRequests() { return totalRequests; }
        public long getTotalErrors() { return totalErrors; }
        public long getTotalAgentRequests() { return totalAgentRequests; }
        public long getTotalAgentErrors() { return totalAgentErrors; }
        public int getActiveAgents() { return activeAgents; }
        
        public double getOverallErrorRate() {
            long total = totalRequests + totalAgentRequests;
            long totalErrors = this.totalErrors + this.totalAgentErrors;
            return total > 0 ? (totalErrors * 100.0 / total) : 0;
        }
    }
}
