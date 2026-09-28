-- PostgreSQL initialization script for Girly Microservices
-- Creates the main database and schemas for each microservice

-- Create the main database (should already exist from docker-compose)
-- \c girly

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for each microservice
CREATE SCHEMA IF NOT EXISTS user_svc;
CREATE SCHEMA IF NOT EXISTS pet_svc;
CREATE SCHEMA IF NOT EXISTS wardrobe_svc;
CREATE SCHEMA IF NOT EXISTS makeup_svc;
CREATE SCHEMA IF NOT EXISTS drama_svc;
CREATE SCHEMA IF NOT EXISTS social_svc;
CREATE SCHEMA IF NOT EXISTS mood_svc;
CREATE SCHEMA IF NOT EXISTS aggregate_svc;

-- Grant permissions (user 'girly' created by docker-compose)
GRANT USAGE ON SCHEMA user_svc TO girly;
GRANT USAGE ON SCHEMA pet_svc TO girly;
GRANT USAGE ON SCHEMA wardrobe_svc TO girly;
GRANT USAGE ON SCHEMA makeup_svc TO girly;
GRANT USAGE ON SCHEMA drama_svc TO girly;
GRANT USAGE ON SCHEMA social_svc TO girly;
GRANT USAGE ON SCHEMA mood_svc TO girly;
GRANT USAGE ON SCHEMA aggregate_svc TO girly;

-- Grant all privileges on schemas to girly user
ALTER DEFAULT PRIVILEGES IN SCHEMA user_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA pet_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA wardrobe_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA makeup_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA drama_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA social_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA mood_svc GRANT ALL ON TABLES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA aggregate_svc GRANT ALL ON TABLES TO girly;

-- Grant sequence privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA user_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA pet_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA wardrobe_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA makeup_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA drama_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA social_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA mood_svc GRANT ALL ON SEQUENCES TO girly;
ALTER DEFAULT PRIVILEGES IN SCHEMA aggregate_svc GRANT ALL ON SEQUENCES TO girly;

-- Create read-only user for aggregate service (to access all schemas)
CREATE ROLE IF NOT EXISTS aggregate_reader WITH LOGIN PASSWORD 'aggregate2024';
GRANT CONNECT ON DATABASE girly TO aggregate_reader;

-- Grant read access to all schemas for aggregate service
GRANT USAGE ON SCHEMA user_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA pet_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA wardrobe_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA makeup_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA drama_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA social_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA mood_svc TO aggregate_reader;
GRANT USAGE ON SCHEMA aggregate_svc TO aggregate_reader;

-- Grant select on all tables in each schema to aggregate_reader
-- This will be applied to future tables automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA user_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA pet_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA wardrobe_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA makeup_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA drama_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA social_svc GRANT SELECT ON TABLES TO aggregate_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA mood_svc GRANT SELECT ON TABLES TO aggregate_reader;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'PostgreSQL schemas initialized successfully for Girly Microservices';
    RAISE NOTICE 'Created schemas: user_svc, pet_svc, wardrobe_svc, makeup_svc, drama_svc, social_svc, mood_svc, aggregate_svc';
END $$;
