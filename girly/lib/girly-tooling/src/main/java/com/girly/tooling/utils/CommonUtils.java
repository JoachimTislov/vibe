package com.girly.tooling.utils;

import jakarta.inject.Singleton;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Common Utilities - Centralized utility functions for all girly services.
 * 
 * This is a CENTRALIZED tooling component that provides commonly needed
 * utility functions to avoid duplication across services.
 * 
 * Only add functions here that are:
 * 1. Used by multiple services
 * 2. Stable and unlikely to change
 * 3. Not service-specific
 */
@Singleton
public class CommonUtils {
    
    // ==================== Date/Time Utilities ====================
    
    public static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    public static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    public static final DateTimeFormatter DATETIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    public static final DateTimeFormatter ISO_DATETIME_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    
    private static final ZoneId DEFAULT_ZONE = ZoneId.of("UTC");
    
    /**
     * Get current UTC timestamp.
     */
    public static Instant nowUtc() {
        return Instant.now();
    }
    
    /**
     * Get current timestamp in the specified zone.
     */
    public static ZonedDateTime nowInZone(ZoneId zone) {
        return ZonedDateTime.now(zone);
    }
    
    /**
     * Get current timestamp in default zone.
     */
    public static ZonedDateTime now() {
        return nowInZone(DEFAULT_ZONE);
    }
    
    /**
     * Format a date as ISO string.
     */
    public static String formatDate(LocalDate date) {
        return date.format(DATE_FORMATTER);
    }
    
    /**
     * Format a time as ISO string.
     */
    public static String formatTime(LocalTime time) {
        return time.format(TIME_FORMATTER);
    }
    
    /**
     * Format a timestamp as ISO string.
     */
    public static String formatDateTime(LocalDateTime dateTime) {
        return dateTime.format(ISO_DATETIME_FORMATTER);
    }
    
    /**
     * Format a timestamp as human-readable string.
     */
    public static String formatDateTimeHuman(LocalDateTime dateTime) {
        return dateTime.format(DATETIME_FORMATTER);
    }
    
    /**
     * Parse a date from ISO string.
     */
    public static LocalDate parseDate(String dateString) {
        return LocalDate.parse(dateString, DATE_FORMATTER);
    }
    
    /**
     * Parse a date-time from ISO string.
     */
    public static LocalDateTime parseDateTime(String dateTimeString) {
        return LocalDateTime.parse(dateTimeString, ISO_DATETIME_FORMATTER);
    }
    
    /**
     * Calculate age from birth date.
     */
    public static int calculateAge(LocalDate birthDate) {
        LocalDate today = LocalDate.now();
        int age = today.getYear() - birthDate.getYear();
        
        if (today.getMonthValue() < birthDate.getMonthValue() ||
            (today.getMonthValue() == birthDate.getMonthValue() &&
             today.getDayOfMonth() < birthDate.getDayOfMonth())) {
            age--;
        }
        
        return age;
    }
    
    /**
     * Calculate time difference in human-readable format.
     */
    public static String timeAgo(Instant timestamp) {
        Instant now = Instant.now();
        Duration duration = Duration.between(timestamp, now);
        
        long days = duration.toDays();
        long hours = duration.toHours() % 24;
        long minutes = duration.toMinutes() % 60;
        long seconds = duration.getSeconds() % 60;
        
        if (days > 0) {
            return days + "d " + hours + "h ago";
        } else if (hours > 0) {
            return hours + "h " + minutes + "m ago";
        } else if (minutes > 0) {
            return minutes + "m ago";
        } else {
            return seconds + "s ago";
        }
    }
    
    // ==================== String Utilities ====================
    
    /**
     * Check if a string is null or empty.
     */
    public static boolean isEmpty(String str) {
        return str == null || str.isEmpty();
    }
    
    /**
     * Check if a string is null or blank.
     */
    public static boolean isBlank(String str) {
        return str == null || str.trim().isEmpty();
    }
    
    /**
     * Get a non-null string, returning default if null.
     */
    public static String nonNull(String str, String defaultValue) {
        return str != null ? str : defaultValue;
    }
    
    /**
     * Capitalize the first letter of a string.
     */
    public static String capitalize(String str) {
        if (isBlank(str)) {
            return str;
        }
        return str.substring(0, 1).toUpperCase() + str.substring(1).toLowerCase();
    }
    
    /**
     * Convert to camel case.
     */
    public static String toCamelCase(String str) {
        if (isBlank(str)) {
            return str;
        }
        
        StringBuilder result = new StringBuilder();
        String[] parts = str.split("[\\s_-\\]+");
        
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (i == 0) {
                result.append(part.toLowerCase());
            } else if (!part.isEmpty()) {
                result.append(capitalize(part));
            }
        }
        
        return result.toString();
    }
    
    /**
     * Convert to snake case.
     */
    public static String toSnakeCase(String str) {
        if (isBlank(str)) {
            return str;
        }
        
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < str.length(); i++) {
            char c = str.charAt(i);
            if (Character.isUpperCase(c)) {
                if (i > 0 && Character.isLowerCase(str.charAt(i - 1))) {
                    result.append("_");
                }
                result.append(Character.toLowerCase(c));
            } else if (Character.isLetterOrDigit(c)) {
                result.append(c);
            } else {
                result.append("_");
            }
        }
        
        return result.toString();
    }
    
    /**
     * Truncate a string to a maximum length.
     */
    public static String truncate(String str, int maxLength) {
        if (str == null) {
            return null;
        }
        if (str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength);
    }
    
    /**
     * Truncate a string and add ellipsis if truncated.
     */
    public static String truncateWithEllipsis(String str, int maxLength) {
        if (str == null) {
            return null;
        }
        if (str.length() <= maxLength) {
            return str;
        }
        if (maxLength <= 3) {
            return str.substring(0, maxLength);
        }
        return str.substring(0, maxLength - 3) + "...";
    }
    
    /**
     * Generate a random string of specified length.
     */
    public static String randomString(int length) {
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(length);
        
        for (int i = 0; i < length; i++) {
            int index = ThreadLocalRandom.current().nextInt(alphabet.length());
            sb.append(alphabet.charAt(index));
        }
        
        return sb.toString();
    }
    
    /**
     * Generate a UUID string.
     */
    public static String generateId() {
        return UUID.randomUUID().toString();
    }
    
    /**
     * Generate a short ID (8 characters).
     */
    public static String generateShortId() {
        return randomString(8);
    }
    
    // ==================== Collection Utilities ====================
    
    /**
     * Create an immutable list from a collection.
     */
    public static <T> List<T> immutableList(Collection<T> collection) {
        return collection != null ? List.copyOf(collection) : List.of();
    }
    
    /**
     * Create an immutable set from a collection.
     */
    public static <T> Set<T> immutableSet(Collection<T> collection) {
        return collection != null ? Set.copyOf(collection) : Set.of();
    }
    
    /**
     * Create an immutable map from a map.
     */
    public static <K, V> Map<K, V> immutableMap(Map<K, V> map) {
        return map != null ? Map.copyOf(map) : Map.of();
    }
    
    /**
     * Get a value from a map with a default if not present.
     */
    public static <K, V> V getOrDefault(Map<K, V> map, K key, V defaultValue) {
        return map != null ? map.getOrDefault(key, defaultValue) : defaultValue;
    }
    
    /**
     * Check if a collection is null or empty.
     */
    public static <T> boolean isEmpty(Collection<T> collection) {
        return collection == null || collection.isEmpty();
    }
    
    /**
     * Check if a map is null or empty.
     */
    public static <K, V> boolean isEmpty(Map<K, V> map) {
        return map == null || map.isEmpty();
    }
    
    // ==================== Validation Utilities ====================
    
    /**
     * Check if an email is valid.
     */
    public static boolean isValidEmail(String email) {
        if (isBlank(email)) {
            return false;
        }
        String regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$";
        return email.matches(regex);
    }
    
    /**
     * Check if a string contains only alphanumeric characters.
     */
    public static boolean isAlphanumeric(String str) {
        if (isBlank(str)) {
            return false;
        }
        return str.matches("^[a-zA-Z0-9]+$");
    }
    
    /**
     * Check if a string is a valid UUID.
     */
    public static boolean isValidUuid(String str) {
        if (isBlank(str)) {
            return false;
        }
        String regex = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
        return str.matches(regex);
    }
    
    // ==================== Retry Utilities ====================
    
    /**
     * Execute an operation with retry logic.
     */
    public static <T> T retry(Supplier<T> operation, int maxRetries, long delayMillis) {
        int attempt = 0;
        
        while (true) {
            try {
                return operation.get();
            } catch (Exception e) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw new RuntimeException("Failed after " + maxRetries + " attempts", e);
                }
                
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry", ie);
                }
            }
        }
    }
    
    /**
     * Execute an operation with retry logic and custom exception handler.
     */
    public static <T> T retry(Supplier<T> operation, int maxRetries, long delayMillis,
                              Class<? extends Exception>... retryableExceptions) {
        int attempt = 0;
        Set<Class<? extends Exception>> retryableSet = Set.of(retryableExceptions);
        
        while (true) {
            try {
                return operation.get();
            } catch (Exception e) {
                attempt++;
                
                // Check if this is a retryable exception
                boolean shouldRetry = false;
                for (Class<? extends Exception> retryable : retryableSet) {
                    if (retryable.isInstance(e)) {
                        shouldRetry = true;
                        break;
                    }
                }
                
                if (!shouldRetry || attempt >= maxRetries) {
                    throw new RuntimeException("Failed after " + attempt + " attempts", e);
                }
                
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry", ie);
                }
            }
        }
    }
    
    // ==================== Object Utilities ====================
    
    /**
     * Check if two objects are equal, handling nulls.
     */
    public static boolean equals(Object a, Object b) {
        return (a == b) || (a != null && a.equals(b));
    }
    
    /**
     * Get hash code for an object, handling null.
     */
    public static int hashCode(Object obj) {
        return obj != null ? obj.hashCode() : 0;
    }
    
    /**
     * Get a string representation of an object, handling null.
     */
    public static String toString(Object obj) {
        return obj != null ? obj.toString() : "null";
    }
    
    // ==================== Numeric Utilities ====================
    
    /**
     * Clamp a value between min and max.
     */
    public static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * Clamp a value between min and max.
     */
    public static long clamp(long value, long min, long max) {
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * Clamp a value between min and max.
     */
    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * Check if a number is between min and max (inclusive).
     */
    public static boolean isBetween(int value, int min, int max) {
        return value >= min && value <= max;
    }
    
    /**
     * Round a double to specified decimal places.
     */
    public static double round(double value, int decimalPlaces) {
        double scale = Math.pow(10, decimalPlaces);
        return Math.round(value * scale) / scale;
    }
    
    // ==================== Thread Utilities ====================
    
    /**
     * Sleep for a specified number of milliseconds.
     */
    public static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    
    /**
     * Sleep for a specified number of seconds.
     */
    public static void sleepSeconds(int seconds) {
        sleep(seconds * 1000L);
    }
}
