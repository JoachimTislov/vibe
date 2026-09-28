package com.girly.common;

/**
 * Global constants for the Girly Microservices Platform.
 * 
 * This class contains shared constants, configuration keys, and default values
 * that are used across all microservices.
 */
public final class Constants {
    
    private Constants() {
        // Utility class - prevent instantiation
    }
    
    // ==================== API Constants ====================
    
    public static final String API_VERSION = "v1";
    public static final String API_BASE_PATH = "/api/" + API_VERSION;
    public static final String HEALTH_ENDPOINT = "/health";
    public static final String METRICS_ENDPOINT = "/metrics";
    public static final String SWAGGER_ENDPOINT = "/swagger";
    
    // ==================== Service Names ====================
    
    public static final String USER_SERVICE = "user-service";
    public static final String PET_SERVICE = "pet-service";
    public static final String WARDROBE_SERVICE = "wardrobe-service";
    public static final String MAKEUP_SERVICE = "makeup-service";
    public static final String DRAMA_SERVICE = "drama-service";
    public static final String SOCIAL_SERVICE = "social-service";
    public static final String MOOD_SERVICE = "mood-service";
    public static final String AGGREGATE_SERVICE = "aggregate-service";
    
    // ==================== Database Constants ====================
    
    public static final String DATABASE_USER = "DATABASE_USER";
    public static final String DATABASE_PASSWORD = "DATABASE_PASSWORD";
    public static final String DATABASE_URL = "DATABASE_URL";
    public static final String DATABASE_SCHEMA = "DATABASE_SCHEMA";
    public static final String DEFAULT_SCHEMA = "public";
    
    // Schema names for each service
    public static final String USER_SCHEMA = "user_svc";
    public static final String PET_SCHEMA = "pet_svc";
    public static final String WARDROBE_SCHEMA = "wardrobe_svc";
    public static final String MAKEUP_SCHEMA = "makeup_svc";
    public static final String DRAMA_SCHEMA = "drama_svc";
    public static final String SOCIAL_SCHEMA = "social_svc";
    public static final String MOOD_SCHEMA = "mood_svc";
    public static final String AGGREGATE_SCHEMA = "aggregate_svc";
    
    // ==================== Security Constants ====================
    
    public static final String JWT_SECRET = "JWT_SECRET";
    public static final String JWT_ISSUER = "girly-platform";
    public static final String JWT_AUDIENCE = "girly-users";
    public static final long JWT_EXPIRATION_MINUTES = 60 * 24; // 24 hours
    public static final long JWT_REFRESH_EXPIRATION_DAYS = 7;
    
    public static final String AUTH_HEADER = "Authorization";
    public static final String BEARER_PREFIX = "Bearer ";
    public static final String X_USER_ID_HEADER = "X-User-Id";
    public static final String X_REQUEST_ID_HEADER = "X-Request-Id";
    
    // ==================== Redis Constants ====================
    
    public static final String REDIS_HOST = "REDIS_HOST";
    public static final String REDIS_PORT = "REDIS_PORT";
    public static final String REDIS_DEFAULT_HOST = "localhost";
    public static final int REDIS_DEFAULT_PORT = 6379;
    public static final int REDIS_TIMEOUT_SECONDS = 30;
    
    // Cache prefixes
    public static final String CACHE_PREFIX_USER = "user:";
    public static final String CACHE_PREFIX_SESSION = "session:";
    public static final String CACHE_PREFIX_RATE_LIMIT = "rate_limit:";
    
    // ==================== Pagination Constants ====================
    
    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;
    public static final int DEFAULT_PAGE_NUMBER = 1;
    
    public static final String PAGE_PARAM = "page";
    public static final String SIZE_PARAM = "size";
    public static final String SORT_PARAM = "sort";
    public static final String ORDER_PARAM = "order";
    
    // ==================== Emotional Constants ====================
    
    /**
     * Emotional states that the platform recognizes and tracks.
     * These are used across mood-service, pet-service (pets react to mood),
     * and drama-service.
     */
    public static class Emotions {
        public static final String HAPPY = "happy";
        public static final String JOYFUL = "joyful";
        public static final String EXCITED = "excited";
        public static final String CONTENT = "content";
        public static final String PROUD = "proud";
        
        public static final String SAD = "sad";
        public static final String LONELY = "lonely";
        public static final String ANXIOUS = "anxious";
        public static final String ANGRY = "angry";
        public static final String BORED = "bored";
        
        public static final String IN_LOVE = "in_love";
        public static final String CALM = "calm";
        public static final String INSPIRED = "inspired";
        public static final String CURIOUS = "curious";
        
        public static final String NEUTRAL = "neutral";
        
        private Emotions() {}
    }
    
    // ==================== HTTP Status Messages ====================
    
    public static class Messages {
        public static final String CREATED = "Resource created successfully";
        public static final String UPDATED = "Resource updated successfully";
        public static final String DELETED = "Resource deleted successfully";
        public static final String NOT_FOUND = "Resource not found";
        public static final String UNAUTHORIZED = "Authentication required";
        public static final String FORBIDDEN = "Access denied";
        public static final String BAD_REQUEST = "Invalid request";
        public static final String CONFLICT = "Resource already exists";
        public static final String INTERNAL_ERROR = "An unexpected error occurred";
        public static final String SERVICE_UNAVAILABLE = "Service temporarily unavailable";
        
        private Messages() {}
    }
    
    // ==================== Date/Time Constants ====================
    
    public static final String DATE_FORMAT = "yyyy-MM-dd";
    public static final String TIME_FORMAT = "HH:mm:ss";
    public static final String DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
    public static final String ISO_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
    
    // ==================== File Upload Constants ====================
    
    public static final long MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    public static final String[] ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"};
    public static final String[] ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "webm"};
    
    // ==================== Rate Limiting ====================
    
    public static final int DEFAULT_RATE_LIMIT_REQUESTS = 100;
    public static final long DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
    
    // ==================== gRPC Constants ====================
    
    public static final int GRPC_PORT = 50051;
    public static final int GRPC_MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
    
    // ==================== WebSocket Constants ====================
    
    public static final String WS_PATH_GAMES = "/ws/games";
    public static final String WS_PATH_CHAT = "/ws/chat";
    public static final String WS_PATH_NOTIFICATIONS = "/ws/notifications";
    public static final int WS_MAX_FRAME_SIZE = 16 * 1024; // 16KB
    public static final int WS_IDLE_TIMEOUT_MINUTES = 30;
}
