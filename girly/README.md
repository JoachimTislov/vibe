# Girly Microservices Ecosystem

A modular microservices platform built with Java and Micronaut, designed to provide a comprehensive suite of services that cater to the diverse needs, interests, and emotions of girls and women. From practical tools to entertaining experiences, this ecosystem aims to be a supportive digital companion through life's ups and downs.

## Philosophy

> "A platform that celebrates the full spectrum of female experience - the joy, the drama, the creativity, the community, and yes, even the sadness. Because life isn't just happy moments, and that's perfectly okay."

This project embodies the idea that technology should serve human emotions and needs authentically. We provide tools for organization, creativity, social connection, and self-expression, while acknowledging that life has its challenges and that's part of what makes us human.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Applications                         │
└───────────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Traefik Ingress (Reverse Proxy)                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │   HTTP/HTTPS    │  │   WebSocket     │  │    gRPC          │    │
│  │     Routing     │  │    Routing      │  │    Routing       │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└───────────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Microservices Layer                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │   user-service    │ │  pet-service      │ │  wardrobe-service │  │
│  │   (Authentication)│ │  (Virtual Pets)   │ │  (Clothing)       │  │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │ makeup-service    │ │ drama-service     │ │  social-service   │  │
│  │   (Beauty)        │ │  (Simulation)     │ │  (Mini-games)     │  │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘  │
│  ┌──────────────────┐ ┌──────────────────┐                        │
│  │  mood-service     │ │  aggregate-service │                        │
│  │   (Emotions)      │ │  (Data Aggregator)│                        │
│  └──────────────────┘ └──────────────────┘                        │
└───────────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database Cluster                        │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Schema: user_svc     │  Schema: pet_svc      │  Schema: ...   │  │
│  │  Schema: wardrobe_svc │  Schema: makeup_svc   │  Schema: ...   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Principles

1. **Modularity**: Each service is independent, can be developed and deployed separately
2. **Shared Infrastructure**: Common libraries, database connection pooling, logging, etc.
3. **Schema Isolation**: Each microservice owns its PostgreSQL schema
4. **Emotional Authenticity**: Features acknowledge the full range of human emotions
5. **Community**: Built-in social features for connection and shared experiences

## Service Directory

| Service | Schema | Description | Status |
|---------|--------|-------------|--------|
| [user-service](./services/user-service) | `user_svc` | Authentication, profiles, user management | ⭐ Core |
| [pet-service](./services/pet-service) | `pet_svc` | Virtual pets (cats, dogs, fantasy creatures) | 🎨 Fun |
| [wardrobe-service](./services/wardrobe-service) | `wardrobe_svc` | Virtual closet, outfit planner, style advice | 👗 Fashion |
| [makeup-service](./services/makeup-service) | `makeup_svc` | Virtual makeup try-on, tutorials, product reviews | 💄 Beauty |
| [drama-service](./services/drama-service) | `drama_svc` | Life simulation, relationship drama, story mode | 🎭 Simulation |
| [social-service](./services/social-service) | `social_svc` | Multiplayer mini-games, friend interactions | 👯 Community |
| [mood-service](./services/mood-service) | `mood_svc` | Emotional tracking, journaling, support | 💔 Wellness |
| [aggregate-service](./services/aggregate-service) | `aggregate_svc` | Cross-service data aggregation, analytics | 📊 Core |

## Technology Stack

- **Framework**: Micronaut (Java)
- **Database**: PostgreSQL (Multi-schema)
- **Ingress**: Traefik (Reverse Proxy + Load Balancer)
- **Service Discovery**: Consul or Kubernetes DNS
- **API Gateway**: Traefik with custom middleware
- **Event Bus**: Redis Streams or Kafka
- **Caching**: Redis
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack or Loki

## Quick Start

### Prerequisites

- Java 17+ (LTS recommended)
- Docker & Docker Compose
- Node.js (for frontend development)
- Git

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd girly

# Start infrastructure (PostgreSQL, Traefik, Redis)
docker-compose -f docker-compose.infra.yml up -d

# Build all services
./gradlew build

# Start all services
./gradlew runAll

# Access the platform
# Traefik dashboard: http://localhost:8080
# API Gateway: http://localhost:8000
```

### Production Deployment

```bash
# Build Docker images for all services
docker-compose -f docker-compose.prod.yml build

# Start production stack
docker-compose -f docker-compose.prod.yml up -d
```

## Project Structure

```
girly/
├── README.md                    # This file
├── docker-compose.infra.yml     # Infrastructure services
├── docker-compose.prod.yml      # Production deployment
├── docker-compose.dev.yml       # Development deployment
├── gradle/
│   └── wrapper/                 # Gradle wrapper
├── gradlew                      # Gradle wrapper (Unix)
├── gradlew.bat                  # Gradle wrapper (Windows)
├── settings.gradle              # Gradle settings
├── build.gradle                 # Root build file
├── lib/                         # Common libraries
│   ├── girly-common/            # Shared utilities
│   ├── girly-db/                # Database access layer
│   ├── girly-models/            # Shared data models
│   └── girly-events/            # Event definitions
└── services/                    # Microservices
    ├── user-service/            # User authentication & management
    ├── pet-service/             # Virtual pets
    ├── wardrobe-service/        # Clothing & fashion
    ├── makeup-service/          # Beauty & makeup
    ├── drama-service/           # Life simulation
    ├── social-service/          # Social features & games
    ├── mood-service/            # Emotional support
    └── aggregate-service/       # Data aggregation
```

## Common Library (lib/)

The `lib/` directory contains shared code that all microservices can depend on:

- **girly-common**: Utility classes, configuration helpers, shared exceptions
- **girly-db**: Database connection pooling, schema management, migration utilities
- **girly-models**: Shared DTOs, enums, and data structures
- **girly-events**: Event definitions for inter-service communication

## Database Design

Each microservice has its own PostgreSQL schema, providing:

1. **Isolation**: Changes to one service don't affect others
2. **Ownership**: Each team owns their schema and data model
3. **Simplified Backups**: Schema-level backups and restores
4. **Clear Boundaries**: Explicit dependencies between services

### Schema Conventions

- Schema names follow pattern: `<service_name>_svc`
- All tables belong to their service's schema
- Cross-service queries go through APIs, not direct SQL
- Aggregate service has read-only access to all schemas for reporting

## API Design

### REST API Standards

- **Base Path**: `/api/v1/` for all services
- **Content-Type**: `application/json`
- **Authentication**: JWT Bearer tokens
- **Rate Limiting**: Per-service configurable limits
- **Documentation**: OpenAPI/Swagger for each service

### gRPC for Internal Communication

- High-performance inter-service communication
- Protocol Buffers for type safety
- Service-to-service authentication via mTLS

### WebSocket for Real-time Features

- Chat and social interactions
- Live multiplayer games
- Real-time notifications

## Feature Research

### What Girls & Women Need from Technology

Based on research and community feedback, here's what makes this platform valuable:

#### 1. **Virtual Pet Companion**
- Emotional support through digital pets
- Cats, dogs, fantasy creatures (unicorns, dragons)
- Pets react to user's mood (via mood-service integration)
- Pet can send encouraging messages
- Pet ages, grows, and has its own personality
- Multiplayer pet interactions (social-service)

#### 2. **Wardrobe & Fashion**
- Virtual closet organization
- Outfit planning for different occasions
- AI-powered style recommendations
- Virtual try-on with AR (future enhancement)
- Shopping integration (affiliate partnerships)
- Outfit sharing with friends
- Seasonal trend tracking

#### 3. **Makeup & Beauty**
- Virtual makeup try-on
- Tutorial library (video + step-by-step)
- Product reviews and recommendations
- Skin tone matching
- Makeup looks for different occasions
- Beauty routine tracking
- Allergy/ingredient checker

#### 4. **Drama Simulation**
- Life simulator with relationship dynamics
- "What would you do?" scenario games
- Story mode with choices and consequences
- Create your own drama stories
- Share stories with community
- Drama analytics (who's the villain, hero, etc.)
- Emotional impact scoring

#### 5. **Social & Mini-Games**
- Multiplayer mini-games (2-4 players)
- Cooperative and competitive games
- Virtual hangout spaces
- Watch parties with synchronized reactions
- Collaborative playlists
- Group challenges and goals
- Friend leaderboards

#### 6. **Mood & Emotional Support**
- Daily mood tracking
- Journaling with prompts
- Emotional analytics and insights
- Community support (anonymous or identified)
- Professional resource directory
- Crisis hotline integration
- Mood-based content recommendations

#### 7. **Data Aggregation**
- Personal dashboard with all service data
- Weekly/Monthly summaries
- Achievements and milestones
- Privacy controls for data sharing
- Export your data
- Cross-service insights

### Emotional Spectrum Coverage

The platform acknowledges that life isn't always happy:

| Emotion | How We Support It |
|---------|-------------------|
| **Joy** | Celebration features, achievement sharing, happy memory storage |
| **Excitement** | Adventure games, new feature discovery, surprise elements |
| **Love** | Friend connection features, romantic simulation scenarios |
| **Pride** | Achievement badges, style showcasing, success stories |
| **Sadness** | Journaling, support communities, emotional tracking |
| **Anger** | Vent spaces, drama scenarios, conflict resolution tools |
| **Anxiety** | Calming activities, mood tracking, professional resources |
| **Loneliness** | Friend finder, group activities, AI companions |
| **Boredom** | Mini-games, new content discovery, challenge modes |

> "It's okay to not be okay. Our platform is a safe space for all emotions, not just the 'acceptable' ones."

## Contribution Guidelines

We welcome contributions from all genders. Male contributors should approach this project with:
- **Empathy**: Understanding that you may not share these experiences
- **Humility**: Willingness to listen and learn from female contributors
- **Respect**: Valuing female perspectives as the primary voice

### Contributing as a Woman

Your perspective is especially valuable. Please:
- Share your experiences and needs
- Critique features that don't resonate
- Suggest new ideas freely
- Your voice matters most in shaping this platform

### Code of Conduct

- Be respectful and inclusive
- No mansplaining
- Acknowledge lived experiences you don't share
- Focus on creating value for the target audience
- Celebrate diversity of experiences among women

## Roadmap

### Phase 1: Foundation (Months 1-2)
- [ ] Core infrastructure (Traefik, PostgreSQL, service templates)
- [ ] Common libraries
- [ ] User service with authentication
- [ ] Basic API Gateway

### Phase 2: Core Services (Months 3-4)
- [ ] Virtual pet service
- [ ] Mood tracking service
- [ ] Basic wardrobe service
- [ ] Simple social features

### Phase 3: Feature Expansion (Months 5-6)
- [ ] Makeup and beauty service
- [ ] Drama simulation service
- [ ] Mini-games platform
- [ ] Data aggregation service

### Phase 4: Polish & Scale (Months 7-8)
- [ ] Performance optimization
- [ ] Mobile applications
- [ ] Advanced AR features
- [ ] Community building

### Phase 5: Emotional Intelligence (Months 9-12)
- [ ] AI-powered emotional analysis
- [ ] Predictive mood tracking
- [ ] Personalized recommendations
- [ features based on user feedback]

## License

MIT License - Feel free to use, modify, and distribute.

## Contact

For questions, suggestions, or collaboration:
- Open an issue on GitHub
- Join our Discord community
- Email: team@girly.tech

---

> "Technology should serve humanity, not the other way around. And humanity includes all the messy, beautiful, complicated emotions that make us who we are."
