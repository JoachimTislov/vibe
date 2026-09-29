package com.girly.tooling.database;

import jakarta.inject.Singleton;

import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Schema Manager - Centralized PostgreSQL schema management for girly microservices.
 * 
 * This is a CENTRALIZED tooling component that provides:
 * - One schema per microservice pattern
 * - Schema creation and management
 * - Connection pooling per schema
 * - Migration support
 * - Cross-schema queries (when needed)
 * 
 * Design Pattern:
 * - Each microservice gets its own PostgreSQL schema
 * - Common tables (like users) can be in a shared schema
 * - Service-specific tables are in service-dedicated schemas
 * - This manager handles all schema operations centrally
 */
@Singleton
public class SchemaManager {
    
    // Schema naming conventions
    private static final String COMMON_SCHEMA = "girly_common";
    private static final String USER_SCHEMA = "girly_users";
    private static final String EVENTS_SCHEMA = "girly_events";
    
    // Schema prefixes for services
    private static final String SERVICE_SCHEMA_PREFIX = "svc_";
    
    // Connection pool configuration
    private static final int DEFAULT_POOL_SIZE = 10;
    private static final long CONNECTION_TIMEOUT_SECONDS = 30;
    
    // Track initialized schemas
    private final Set<String> initializedSchemas = ConcurrentHashMap.newKeySet();
    
    // Configuration
    private String jdbcUrl;
    private String username;
    private String password;
    private int maxPoolSize = DEFAULT_POOL_SIZE;
    private boolean autoCreateSchemas = true;
    
    // Connection pools (simplified - in production use HikariCP or similar)
    private final Map<String, List<Connection>> connectionPools = new ConcurrentHashMap<>();
    
    // ==================== Schema Names ====================
    
    /**
     * Get the schema name for a service.
     * 
     * Convention: svc_{service-name}
     * Example: svc_mood, svc_pet, svc_social
     */
    public String getSchemaName(String serviceName) {
        if (serviceName == null || serviceName.isEmpty()) {
            throw new IllegalArgumentException("Service name cannot be empty");
        }
        
        // Normalize service name
        String normalized = serviceName.toLowerCase()
            .replace("-", "_")
            .replace(".", "_")
            .replace(" ", "_");
        
        return SERVICE_SCHEMA_PREFIX + normalized;
    }
    
    /**
     * Get the schema name for the common girly tables.
     */
    public String getCommonSchema() {
        return COMMON_SCHEMA;
    }
    
    /**
     * Get the schema name for user management.
     */
    public String getUserSchema() {
        return USER_SCHEMA;
    }
    
    /**
     * Get the schema name for event tracking.
     */
    public String getEventsSchema() {
        return EVENTS_SCHEMA;
    }
    
    // ==================== Schema Initialization ====================
    
    /**
     * Initialize a schema for a service.
     * Creates the schema if it doesn't exist and sets up required tables.
     */
    public void initializeSchema(String serviceName) {
        String schemaName = getSchemaName(serviceName);
        
        if (initializedSchemas.contains(schemaName)) {
            return; // Already initialized
        }
        
        try (Connection connection = getAdminConnection()) {
            // Create schema if it doesn't exist
            if (autoCreateSchemas) {
                createSchemaIfNotExists(connection, schemaName);
            }
            
            // Initialize connection pool for this schema
            initializeConnectionPool(schemaName);
            
            // Create service-specific tables
            createServiceTables(schemaName, serviceName);
            
            initializedSchemas.add(schemaName);
            System.out.println("Initialized schema: " + schemaName);
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to initialize schema: " + schemaName, e);
        }
    }
    
    /**
     * Create a schema if it doesn't exist.
     */
    private void createSchemaIfNotExists(Connection connection, String schemaName) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            // Check if schema exists
            ResultSet resultSet = statement.executeQuery(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name = '" + 
                schemaName.toLowerCase() + "'"
            );
            
            if (!resultSet.next()) {
                // Schema doesn't exist, create it
                statement.execute("CREATE SCHEMA " + schemaName);
                System.out.println("Created schema: " + schemaName);
            }
        }
    }
    
    /**
     * Create service-specific tables in the schema.
     * 
     * This is a base implementation. Services should override or extend
     * this to create their specific tables.
     */
    private void createServiceTables(String schemaName, String serviceName) throws SQLException {
        // Base tables that most services might need
        String[] baseTables = {
            "configurations",    // Service configuration
            "audit_log",        // Audit log for the service
            "metrics"           // Service metrics
        };
        
        try (Connection connection = getConnection(schemaName)) {
            for (String table : baseTables) {
                createTableIfNotExists(connection, schemaName, table, getTableDefinition(serviceName, table));
            }
        }
    }
    
    /**
     * Get the table definition for a base table.
     */
    private String getTableDefinition(String serviceName, String tableName) {
        switch (tableName) {
            case "configurations":
                return """
                    CREATE TABLE configurations (
                        id SERIAL PRIMARY KEY,
                        config_key VARCHAR(255) NOT NULL UNIQUE,
                        config_value TEXT,
                        description TEXT,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        version INTEGER DEFAULT 1
                    )
                """;
            
            case "audit_log":
                return """
                    CREATE TABLE audit_log (
                        id BIGSERIAL PRIMARY KEY,
                        action VARCHAR(100) NOT NULL,
                        entity_type VARCHAR(100) NOT NULL,
                        entity_id BIGINT NOT NULL,
                        user_id BIGINT,
                        old_values JSONB,
                        new_values JSONB,
                        ip_address INET,
                        user_agent TEXT,
                        status VARCHAR(20),
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                """;
            
            case "metrics":
                return """
                    CREATE TABLE metrics (
                        id BIGSERIAL PRIMARY KEY,
                        metric_name VARCHAR(255) NOT NULL,
                        metric_value DOUBLE PRECISION NOT NULL,
                        tags JSONB,
                        timestamp TIMESTAMP DEFAULT NOW()
                    )
                """;
            
            default:
                return null;
        }
    }
    
    /**
     * Create a table if it doesn't exist.
     */
    private void createTableIfNotExists(Connection connection, String schemaName, 
                                       String tableName, String definition) throws SQLException {
        if (definition == null) {
            return; // No definition provided
        }
        
        try (Statement statement = connection.createStatement()) {
            // Check if table exists
            ResultSet resultSet = statement.executeQuery(
                "SELECT table_name FROM information_schema.tables " +
                "WHERE table_schema = '" + schemaName.toLowerCase() + "' " +
                "AND table_name = '" + tableName.toLowerCase() + "'"
            );
            
            if (!resultSet.next()) {
                // Table doesn't exist, create it
                statement.execute(definition);
                System.out.println("Created table: " + schemaName + "." + tableName);
            }
        }
    }
    
    // ==================== Connection Management ====================
    
    /**
     * Get an administrative connection (without schema qualification).
     */
    private Connection getAdminConnection() throws SQLException {
        if (jdbcUrl == null || username == null || password == null) {
            throw new IllegalStateException("Database configuration not set");
        }
        
        Connection connection = DriverManager.getConnection(jdbcUrl, username, password);
        connection.setAutoCommit(true);
        return connection;
    }
    
    /**
     * Get a connection to a specific schema.
     * 
     * The connection will have its search_path set to the specified schema.
     */
    public Connection getConnection(String schemaName) throws SQLException {
        if (jdbcUrl == null || username == null || password == null) {
            throw new IllegalStateException("Database configuration not set");
        }
        
        Connection connection = DriverManager.getConnection(jdbcUrl, username, password);
        
        // Set search_path to include the service schema and common schema
        String searchPath = schemaName + "," + COMMON_SCHEMA + ",public";
        try (Statement statement = connection.createStatement()) {
            statement.execute("SET search_path TO " + searchPath);
        }
        
        connection.setAutoCommit(true);
        return connection;
    }
    
    /**
     * Get a connection from the pool for a specific schema.
     */
    public Connection getPooledConnection(String schemaName) throws SQLException {
        // Simplified pool - in production use a real connection pool
        List<Connection> pool = connectionPools.computeIfAbsent(
            schemaName, 
            k -> new ArrayList<>(maxPoolSize)
        );
        
        synchronized (pool) {
            if (!pool.isEmpty()) {
                Connection connection = pool.remove(0);
                if (connection.isValid(1)) {
                    return connection;
                }
            }
            
            // Create new connection
            return getConnection(schemaName);
        }
    }
    
    /**
     * Return a connection to the pool.
     */
    public void returnConnection(String schemaName, Connection connection) {
        if (connection == null) return;
        
        List<Connection> pool = connectionPools.get(schemaName);
        if (pool == null) return;
        
        synchronized (pool) {
            if (pool.size() < maxPoolSize) {
                pool.add(connection);
            } else {
                try {
                    connection.close();
                } catch (SQLException e) {
                    System.err.println("Failed to close connection: " + e.getMessage());
                }
            }
        }
    }
    
    /**
     * Initialize connection pool for a schema.
     */
    private void initializeConnectionPool(String schemaName) {
        connectionPools.computeIfAbsent(schemaName, k -> new ArrayList<>(maxPoolSize));
    }
    
    // ==================== Schema Operations ====================
    
    /**
     * Check if a schema exists.
     */
    public boolean schemaExists(String schemaName) {
        try (Connection connection = getAdminConnection()) {
            try (Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name = '" + 
                    schemaName.toLowerCase() + "'"
                );
                return resultSet.next();
            }
        } catch (SQLException e) {
            return false;
        }
    }
    
    /**
     * List all schemas in the database.
     */
    public List<String> listSchemas() {
        List<String> schemas = new ArrayList<>();
        
        try (Connection connection = getAdminConnection()) {
            try (Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery(
                    "SELECT schema_name FROM information_schema.schemata " +
                    "WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema' " +
                    "ORDER BY schema_name"
                );
                
                while (resultSet.next()) {
                    schemas.add(resultSet.getString("schema_name"));
                }
            }
        } catch (SQLException e) {
            System.err.println("Failed to list schemas: " + e.getMessage());
        }
        
        return schemas;
    }
    
    /**
     * List all girly-related schemas.
     */
    public List<String> listGirlySchemas() {
        List<String> allSchemas = listSchemas();
        List<String> girlySchemas = new ArrayList<>();
        
        for (String schema : allSchemas) {
            if (schema.startsWith(SERVICE_SCHEMA_PREFIX) ||
                schema.equals(COMMON_SCHEMA) ||
                schema.equals(USER_SCHEMA) ||
                schema.equals(EVENTS_SCHEMA)) {
                girlySchemas.add(schema);
            }
        }
        
        return girlySchemas;
    }
    
    // ==================== Cross-Schema Queries ====================
    
    /**
     * Execute a cross-schema query.
     * 
     * This should be used sparingly - only when absolutely necessary.
     * Prefer schema-specific queries whenever possible.
     */
    public ResultSet executeCrossSchemaQuery(String query) throws SQLException {
        Connection connection = getAdminConnection();
        Statement statement = connection.createStatement();
        return statement.executeQuery(query);
    }
    
    /**
     * Execute a cross-schema update.
     */
    public int executeCrossSchemaUpdate(String query) throws SQLException {
        try (Connection connection = getAdminConnection();
             Statement statement = connection.createStatement()) {
            return statement.executeUpdate(query);
        }
    }
    
    // ==================== Migration Support ====================
    
    /**
     * Check if migrations are needed for a schema.
     */
    public boolean needsMigration(String schemaName, int currentVersion) {
        // Implementation: check migration table in schema
        try (Connection connection = getConnection(schemaName)) {
            try (Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery(
                    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
                );
                
                if (!resultSet.next()) {
                    return true; // No migrations recorded
                }
                
                int latestVersion = resultSet.getInt("version");
                return latestVersion < currentVersion;
            }
        } catch (SQLException e) {
            return true; // Assume migration needed if we can't check
        }
    }
    
    /**
     * Record a migration for a schema.
     */
    public void recordMigration(String schemaName, int version, String description) {
        try (Connection connection = getConnection(schemaName)) {
            try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, NOW())")) {
                statement.setInt(1, version);
                statement.setString(2, description);
                statement.executeUpdate();
            }
        } catch (SQLException e) {
            System.err.println("Failed to record migration: " + e.getMessage());
        }
    }
    
    /**
     * Initialize the migration tracking table for a schema.
     */
    public void initializeMigrationTable(String schemaName) {
        try (Connection connection = getConnection(schemaName)) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        id SERIAL PRIMARY KEY,
                        version INTEGER NOT NULL,
                        description TEXT NOT NULL,
                        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        UNIQUE(version)
                    )
                """);
            }
        } catch (SQLException e) {
            System.err.println("Failed to initialize migration table: " + e.getMessage());
        }
    }
    
    // ==================== Configuration ====================
    
    public String getJdbcUrl() {
        return jdbcUrl;
    }
    
    public void setJdbcUrl(String jdbcUrl) {
        this.jdbcUrl = jdbcUrl;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getPassword() {
        return password;
    }
    
    public void setPassword(String password) {
        this.password = password;
    }
    
    public int getMaxPoolSize() {
        return maxPoolSize;
    }
    
    public void setMaxPoolSize(int maxPoolSize) {
        this.maxPoolSize = maxPoolSize;
    }
    
    public boolean isAutoCreateSchemas() {
        return autoCreateSchemas;
    }
    
    public void setAutoCreateSchemas(boolean autoCreateSchemas) {
        this.autoCreateSchemas = autoCreateSchemas;
    }
    
    // ==================== Utility Methods ====================
    
    /**
     * Get all table names in a schema.
     */
    public List<String> getTableNames(String schemaName) {
        List<String> tables = new ArrayList<>();
        
        try (Connection connection = getConnection(schemaName)) {
            try (Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery(
                    "SELECT table_name FROM information_schema.tables " +
                    "WHERE table_schema = '" + schemaName.toLowerCase() + "' " +
                    "AND table_type = 'BASE TABLE' " +
                    "ORDER BY table_name"
                );
                
                while (resultSet.next()) {
                    tables.add(resultSet.getString("table_name"));
                }
            }
        } catch (SQLException e) {
            System.err.println("Failed to get table names: " + e.getMessage());
        }
        
        return tables;
    }
    
    /**
     * Get table definition (DDL) for a specific table.
     */
    public String getTableDefinition(String schemaName, String tableName) {
        try (Connection connection = getConnection(schemaName)) {
            try (Statement statement = connection.createStatement()) {
                ResultSet resultSet = statement.executeQuery(
                    "SELECT column_name, data_type, is_nullable, column_default " +
                    "FROM information_schema.columns " +
                    "WHERE table_schema = '" + schemaName.toLowerCase() + "' " +
                    "AND table_name = '" + tableName.toLowerCase() + "' " +
                    "ORDER BY ordinal_position"
                );
                
                StringBuilder ddl = new StringBuilder();
                ddl.append("CREATE TABLE ").append(schemaName).append(".").append(tableName).append(" (\n");
                
                while (resultSet.next()) {
                    String column = resultSet.getString("column_name");
                    String type = resultSet.getString("data_type");
                    String nullable = resultSet.getString("is_nullable");
                    String defaultValue = resultSet.getString("column_default");
                    
                    ddl.append("  ").append(column).append(" ").append(type);
                    if ("NO".equals(nullable)) {
                        ddl.append(" NOT NULL");
                    }
                    if (defaultValue != null && !defaultValue.isEmpty()) {
                        ddl.append(" DEFAULT ").append(defaultValue);
                    }
                    ddl.append(",\n");
                }
                
                ddl.append(");");
                return ddl.toString();
            }
        } catch (SQLException e) {
            System.err.println("Failed to get table definition: " + e.getMessage());
            return null;
        }
    }
    
    // ==================== Exception ====================
    
    /**
     * Custom exception for database operations.
     */
    public static class DatabaseException extends RuntimeException {
        public DatabaseException(String message) {
            super(message);
        }
        
        public DatabaseException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
