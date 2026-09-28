package com.girly.tooling.agent;

import io.micronaut.context.ApplicationContext;
import io.micronaut.context.annotation.Context;
import io.micronaut.inject.BeanDefinition;
import jakarta.inject.Inject;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Agent Manager - Central registry and manager for all Girly agents.
 * 
 * This class provides:
 * - Discovery and registration of all agents in the system
 * - Health monitoring across all agents
 * - Centralized configuration management
 * - Lifecycle coordination
 * 
 * All agents are automatically discovered and registered through Micronaut's
 * dependency injection system.
 */
@Context
public class AgentManager {
    
    private final Map<String, BaseAgent> agents = new ConcurrentHashMap<>();
    private final Map<BaseAgent.AgentCapability, Set<String>> capabilityIndex = new ConcurrentHashMap<>();
    
    @Inject
    private ApplicationContext applicationContext;
    
    // ==================== Agent Discovery ====================
    
    /**
     * Discover and register all agents in the application context.
     * Called automatically during application startup.
     */
    public void discoverAgents() {
        // Find all beans that extend BaseAgent
        applicationContext.getAllBeanDefinitions()
            .stream()
            .map(BeanDefinition::getBeanType)
            .filter(Objects::nonNull)
            .filter(BaseAgent.class::isAssignableFrom)
            .forEach(beanType -> {
                try {
                    BaseAgent agent = (BaseAgent) applicationContext.getBean(beanType);
                    registerAgent(agent);
                } catch (Exception e) {
                    System.err.println("Failed to instantiate agent: " + beanType.getName());
                }
            });
    }
    
    /**
     * Register an agent with the manager.
     */
    public void registerAgent(BaseAgent agent) {
        String name = agent.getAgentName();
        agents.put(name, agent);
        
        // Index by capabilities
        agent.getCapabilities().forEach(capability -> {
            capabilityIndex.computeIfAbsent(capability, k -> ConcurrentHashMap.newKeySet())
                           .add(name);
        });
        
        System.out.println("Registered agent: " + name + " with capabilities: " + agent.getCapabilities());
    }
    
    /**
     * Unregister an agent.
     */
    public void unregisterAgent(String agentName) {
        BaseAgent agent = agents.remove(agentName);
        if (agent != null) {
            // Remove from capability index
            agent.getCapabilities().forEach(capability -> {
                Set<String> agentNames = capabilityIndex.get(capability);
                if (agentNames != null) {
                    agentNames.remove(agentName);
                }
            });
        }
    }
    
    // ==================== Agent Access ====================
    
    /**
     * Get an agent by name.
     */
    public Optional<BaseAgent> getAgent(String name) {
        return Optional.ofNullable(agents.get(name));
    }
    
    /**
     * Get all registered agents.
     */
    public Collection<BaseAgent> getAllAgents() {
        return Collections.unmodifiableCollection(agents.values());
    }
    
    /**
     * Get all agent names.
     */
    public Set<String> getAgentNames() {
        return Collections.unmodifiableSet(agents.keySet());
    }
    
    // ==================== Capability-Based Discovery ====================
    
    /**
     * Find all agents that support a specific capability.
     */
    public Set<String> getAgentsWithCapability(BaseAgent.AgentCapability capability) {
        return Collections.unmodifiableSet(
            capabilityIndex.getOrDefault(capability, Collections.emptySet())
        );
    }
    
    /**
     * Check if any agent supports a capability.
     */
    public boolean hasCapability(BaseAgent.AgentCapability capability) {
        return !getAgentsWithCapability(capability).isEmpty();
    }
    
    /**
     * Find agents that support all of the specified capabilities.
     */
    public Set<String> getAgentsWithCapabilities(Set<BaseAgent.AgentCapability> capabilities) {
        if (capabilities.isEmpty()) {
            return getAgentNames();
        }
        
        Set<String> result = null;
        for (BaseAgent.AgentCapability capability : capabilities) {
            Set<String> agentsWithCap = getAgentsWithCapability(capability);
            if (result == null) {
                result = new HashSet<>(agentsWithCap);
            } else {
                result.retainAll(agentsWithCap);
            }
            if (result.isEmpty()) {
                break;
            }
        }
        
        return result != null ? Collections.unmodifiableSet(result) : Collections.emptySet();
    }
    
    // ==================== Health Monitoring ====================
    
    /**
     * Get health status of all agents.
     */
    public Map<String, BaseAgent.HealthCheckResult> getAllHealthStatuses() {
        Map<String, BaseAgent.HealthCheckResult> results = new HashMap<>();
        
        for (Map.Entry<String, BaseAgent> entry : agents.entrySet()) {
            results.put(entry.getKey(), entry.getValue().healthCheck());
        }
        
        return Collections.unmodifiableMap(results);
    }
    
    /**
     * Get health status of a specific agent.
     */
    public Optional<BaseAgent.HealthCheckResult> getHealthStatus(String agentName) {
        return getAgent(agentName).map(BaseAgent::healthCheck);
    }
    
    /**
     * Check if all agents are healthy.
     */
    public boolean areAllAgentsHealthy() {
        return getAllHealthStatuses().values().stream()
                .allMatch(BaseAgent.HealthCheckResult::isHealthy);
    }
    
    /**
     * Get unhealthy agents.
     */
    public Set<String> getUnhealthyAgents() {
        return getAllHealthStatuses().entrySet().stream()
                .filter(entry -> !entry.getValue().isHealthy())
                .map(Map.Entry::getKey)
                .collect(Collectors.toUnmodifiableSet());
    }
    
    // ==================== Lifecycle Management ====================
    
    /**
     * Start all registered agents.
     */
    public void startAll() {
        agents.values().forEach(this::startAgent);
    }
    
    /**
     * Start a specific agent.
     */
    public void startAgent(String name) {
        getAgent(name).ifPresent(this::startAgent);
    }
    
    private void startAgent(BaseAgent agent) {
        // Agents are started automatically by Micronaut
        // This method is here for explicit control if needed
    }
    
    /**
     * Stop all registered agents.
     */
    public void stopAll() {
        agents.values().forEach(this::stopAgent);
    }
    
    /**
     * Stop a specific agent.
     */
    public void stopAgent(String name) {
        getAgent(name).ifPresent(this::stopAgent);
    }
    
    private void stopAgent(BaseAgent agent) {
        // In Micronaut, beans are managed by the context
        // We can't directly stop singleton beans, but we can call their stop method
        try {
            agent.stop();
        } catch (Exception e) {
            System.err.println("Failed to stop agent: " + agent.getAgentName());
        }
    }
    
    // ==================== Statistics ====================
    
    /**
     * Get summary statistics about all agents.
     */
    public AgentStatistics getStatistics() {
        long total = agents.size();
        long healthy = getAllHealthStatuses().values().stream()
                       .filter(BaseAgent.HealthCheckResult::isHealthy)
                       .count();
        
        Map<BaseAgent.AgentStatus, Long> statusCounts = agents.values().stream()
                .collect(Collectors.groupingBy(
                    BaseAgent::getStatus,
                    Collectors.counting()
                ));
        
        return new AgentStatistics(
            total,
            healthy,
            total - healthy,
            statusCounts,
            capabilityIndex.size()
        );
    }
    
    // ==================== Inner Classes ====================
    
    /**
     * Statistics about the agent system.
     */
    public static class AgentStatistics {
        private final long totalAgents;
        private final long healthyAgents;
        private final long unhealthyAgents;
        private final Map<BaseAgent.AgentStatus, Long> statusCounts;
        private final int totalCapabilities;
        
        public AgentStatistics(long totalAgents, long healthyAgents, 
                              long unhealthyAgents, 
                              Map<BaseAgent.AgentStatus, Long> statusCounts,
                              int totalCapabilities) {
            this.totalAgents = totalAgents;
            this.healthyAgents = healthyAgents;
            this.unhealthyAgents = unhealthyAgents;
            this.statusCounts = Collections.unmodifiableMap(statusCounts);
            this.totalCapabilities = totalCapabilities;
        }
        
        // Getters
        public long getTotalAgents() { return totalAgents; }
        public long getHealthyAgents() { return healthyAgents; }
        public long getUnhealthyAgents() { return unhealthyAgents; }
        public Map<BaseAgent.AgentStatus, Long> getStatusCounts() { return statusCounts; }
        public int getTotalCapabilities() { return totalCapabilities; }
        
        public double getHealthyPercentage() {
            return totalAgents > 0 ? (healthyAgents * 100.0 / totalAgents) : 0.0;
        }
    }
}
