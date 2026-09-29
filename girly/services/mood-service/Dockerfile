# Mood Service Dockerfile
# Multi-stage build for smaller final image

# Build stage
FROM gradle:8.5.0-jdk17 AS build

# Set working directory
WORKDIR /home/gradle/src

# Copy build files
COPY build.gradle settings.gradle gradle.properties ./
COPY gradle ./gradle

# Copy source files
COPY lib ./lib
COPY services/mood-service ./services/mood-service

# Build the application
RUN gradle :services:mood-service:build -x test

# Run stage
FROM eclipse-temurin:17-jre-alpine

# Set working directory
WORKDIR /app

# Copy built JAR from build stage
COPY --from=build /home/gradle/src/services/mood-service/build/libs/mood-service-0.1.0-SNAPSHOT.jar app.jar

# Create non-root user
RUN addgroup -S girly && adduser -S girly -G girly
USER girly

# Expose port
EXPOSE 8080

# Set JVM options
ENV JAVA_OPTS="-Xmx512m -Xms256m -XX:+UseContainerSupport -XX:MaxRAMPercentage=80.0"

# Set environment variables
ENV MICRONAUT_ENVIRONMENTS=prod
ENV MICRONAUT_APPLICATION_NAME=mood-service

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Entry point
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar /app/app.jar"]
