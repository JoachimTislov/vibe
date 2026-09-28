# Girly Microservices Platform - Setup Guide

## Quick Start

This guide will get you from zero to a running development environment in minutes.

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required
1. **Java JDK 17+** (LTS recommended)
   - [Oracle JDK](https://www.oracle.com/java/technologies/javase-downloads.html)
   - [OpenJDK](https://adoptium.net/)
   - Verify: `java -version` should show Java 17+

2. **Git**
   - [Download Git](https://git-scm.com/downloads)
   - Verify: `git --version`

3. **Docker & Docker Compose**
   - [Docker Desktop](https://www.docker.com/products/docker-desktop) (recommended)
   - Or Docker Engine + Docker Compose separately
   - Verify: `docker --version` and `docker-compose --version`
   - Ensure Docker daemon is running

4. **Gradle** (optional - project includes Gradle Wrapper)
   - If you have Gradle installed: version 8.5+
   - Otherwise, use the included Gradle Wrapper: `./gradlew`

### Recommended
1. **IDE**
   - [IntelliJ IDEA](https://www.jetbrains.com/idea/) (Community or Ultimate)
   - [VS Code](https://code.visualstudio.com/) with Java extensions
   - [Eclipse](https://www.eclipse.org/)

2. **PostgreSQL Client** (for direct database access)
   - [pgAdmin](https://www.pgadmin.org/)
   - [DBeaver](https://dbeaver.io/)
   - [TablePlus](https://tableplus.com/)

3. **API Testing Tool**
   - [Postman](https://www.postman.com/)
   - [Insomnia](https://insomnia.rest/)
   - [cURL](https://curl.se/)

---

## Project Structure

```
girly/
├── README.md                    # Platform overview
├── RESEARCH.md                  # User needs research
├── SETUP_GUIDE.md               # This file
├── .gitignore                   # Git ignore rules
├── 
├── # Build files
├── build.gradle                 # Root build configuration
├── settings.gradle              # Project settings
├── gradle/
│   └── wrapper/                 # Gradle wrapper
├── gradlew                      # Gradle wrapper script (Unix)
├── gradlew.bat                  # Gradle wrapper script (Windows)
├── 
├── # Docker configurations
├── docker-compose.infra.yml     # Infrastructure services (PostgreSQL, Traefik, Redis)
├── docker-compose.dev.yml       # Development deployment
├── docker-compose.prod.yml      # Production deployment
└── docker/                      # Docker configuration files
    ├── postgres/                # PostgreSQL configs
    ├── prometheus/              # Monitoring configs
    └── grafana/                  # Visualization configs
    
├── # Common libraries
└── lib/
    ├── girly-common/            # Shared utilities and constants
    ├── girly-db/                # Database access layer
    ├── girly-models/            # Shared data models
    └── girly-events/            # Event definitions

└── # Microservices
    └── services/
        ├── user-service/        # Authentication & user management
        ├── pet-service/         # Virtual pets
        ├── wardrobe-service/    # Fashion & clothing
        ├── makeup-service/      # Beauty & makeup
        ├── drama-service/       # Life simulation
        ├── social-service/      # Social features & games
        ├── mood-service/        # Emotional support
        └── aggregate-service/   # Data aggregation
```

---

## Setup Steps

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone <repository-url>
cd girly

# If you don't have a repository yet, just create the directory
git init
```

### Step 2: Build the Project

Using the Gradle Wrapper (recommended):

```bash
# On Unix/Linux/macOS
./gradlew build

# On Windows
gradlew.bat build

# To skip tests (faster first build)
./gradlew build -x test
```

If you have Gradle installed globally:

```bash
gradle build
```

**First build will take several minutes** as it downloads all dependencies.

### Step 3: Start Infrastructure Services

```bash
# Start PostgreSQL, Traefik, Redis, and monitoring
docker-compose -f docker-compose.infra.yml up -d

# Verify services are running
docker-compose -f docker-compose.infra.yml ps

# Expected output:
# Name                     Command               State           Ports
# -----------------------------------------------------------------------
# girly-grafana     /run.sh                         Up      0.0.0.0:3000->3000/tcp
# girly-postgres    docker-entrypoint.sh postgres   Up      0.0.0.0:5432->5432/tcp
# girly-prometheus  /main - --config.file=/etc ... Up      0.0.0.0:9090->9090/tcp
# girly-redis       docker-entrypoint.sh redis ... Up      0.0.0.0:6379->6379/tcp
# girly-traefik     /traefik --providers.docke ... Up      0.0.0.0:80->80/tcp, ...
```

### Step 4: Verify Database

```bash
# Connect to PostgreSQL
docker exec -it girly-postgres psql -U girly -d girly

# In the PostgreSQL shell, verify schemas:
\dn

# Expected output:
#   Name       |  Owner
# ------------+----------
#  aggregate_svc | girly
#  drama_svc      | girly
#  makeup_svc     | girly
#  mood_svc       | girly
#  pet_svc        | girly
#  social_svc     | girly
#  user_svc       | girly
#  wardrobe_svc   | girly
#  public        | postgres
```

Exit PostgreSQL: `\q`

### Step 5: Access Services

#### Traefik Dashboard
- URL: http://localhost:8080
- Shows all running services and their status

#### Grafana (Monitoring)
- URL: http://localhost:3000
- Username: admin
- Password: girly2024

#### Prometheus (Metrics)
- URL: http://localhost:9090

### Step 6: Start Microservices

```bash
# Option 1: Start all services using Gradle
./gradlew runAll

# Option 2: Start services individually
# In separate terminals:
./gradlew :services:user-service:run
./gradlew :services:pet-service:run
# etc.

# Option 3: Use Docker Compose for development
# First, build the images:
docker-compose -f docker-compose.dev.yml build

# Then start:
docker-compose -f docker-compose.dev.yml up -d
```

**Note**: If using Gradle `run` commands, services will run in the foreground. Use Ctrl+C to stop.

---

## Development Workflow

### Running a Single Service

```bash
# Navigate to service directory
cd services/user-service

# Run the service
../../gradlew run

# Or use the wrapper
../gradlew :services:user-service:run
```

### Hot Reload (Development Mode)

Micronaut supports automatic reloading during development:

```bash
# Run with dev profile
MICRONAUT_ENVIRONMENTS=dev ./gradlew :services:user-service:run

# Changes to Java files will trigger automatic reload
# Changes to configuration files require manual restart
```

### Testing

```bash
# Run all tests
./gradlew test

# Run tests for a specific service
./gradlew :services:user-service:test

# Run a specific test class
./gradlew :services:user-service:test --tests "com.girly.user.controller.*"
```

### Database Operations

#### Access PostgreSQL

```bash
# Connect to database
docker exec -it girly-postgres psql -U girly -d girly
```

#### Reset Database (Development)

```bash
# WARNING: This will delete all data!
docker-compose -f docker-compose.infra.yml down -v
docker-compose -f docker-compose.infra.yml up -d
```

#### Run Migrations

Each service handles its own schema migrations. When a service starts, it will:
1. Check if tables exist
2. Run any pending migrations (if using Flyway/Liquibase)
3. Or use `spring.jpa.hibernate.ddl-auto=update` (for development)

For production, use proper migration tools like Flyway or Liquibase.

---

## Service Endpoints

### Common Endpoints (All Services)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check endpoint |
| GET | `/metrics` | Prometheus metrics |
| GET | `/swagger` | Swagger UI (if enabled) |
| GET | `/swagger/api-docs` | OpenAPI documentation |

### User Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Get current user |
| GET | `/api/v1/users/{id}` | Get user by ID |
| PUT | `/api/v1/users/{id}` | Update user |
| DELETE | `/api/v1/users/{id}` | Delete user |

### Pet Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/pets` | List all pets |
| POST | `/api/v1/pets` | Create new pet |
| GET | `/api/v1/pets/{id}` | Get pet by ID |
| PUT | `/api/v1/pets/{id}` | Update pet |
| DELETE | `/api/v1/pets/{id}` | Delete pet |
| POST | `/api/v1/pets/{id}/feed` | Feed pet |
| POST | `/api/v1/pets/{id}/play` | Play with pet |
| POST | `/api/v1/pets/{id}/groom` | Groom pet |
| GET | `/api/v1/pets/{id}/mood` | Get pet mood |

### Wardrobe Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/wardrobe/items` | List all clothing items |
| POST | `/api/v1/wardrobe/items` | Add clothing item |
| GET | `/api/v1/wardrobe/items/{id}` | Get item by ID |
| PUT | `/api/v1/wardrobe/items/{id}` | Update item |
| DELETE | `/api/v1/wardrobe/items/{id}` | Delete item |
| GET | `/api/v1/wardrobe/outfits` | List all outfits |
| POST | `/api/v1/wardrobe/outfits` | Create outfit |
| POST | `/api/v1/wardrobe/outfits/suggest` | Get outfit suggestions |

### API Testing

#### Using cURL

```bash
# Register a new user
curl -X POST http://localhost:8001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "displayName": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login
TOKEN=$(curl -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}' | jq -r '.accessToken')

# Access protected endpoint
echo $TOKEN
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/v1/auth/me
```

#### Using Postman

1. Create a new collection for "Girly API"
2. Add requests for each endpoint
3. Set up environment variables for `baseUrl`, `token`, etc.
4. Create authentication helper to automatically set the Bearer token

---

## Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs girly-postgres

# Verify connection from service container
docker exec -it girly-user-service bash
# Then try: curl -v http://postgres:5432
```

**Solution**: Ensure PostgreSQL is healthy (`docker-compose -f docker-compose.infra.yml ps`) and all services are on the same Docker network.

#### Port Already in Use

```bash
# Find which process is using the port
sudo lsof -i :8080

# Or on macOS
lsof -i :8080

# Kill the process
kill -9 <PID>
```

**Solution**: Stop the conflicting process or use a different port.

#### Gradle Build Fails

```bash
# Clean and retry
./gradlew clean build

# If dependency resolution fails
./gradlew clean build --refresh-dependencies

# Check Java version
java -version
```

**Solution**: Ensure Java 17+ is installed and in PATH.

#### Service Fails to Start

```bash
# Check logs
./gradlew :services:user-service:run --stacktrace

# Or for Docker
ocker logs girly-user-service
```

**Solution**: Look for specific error messages in the logs. Common issues:
- Missing environment variables
- Database not ready (wait for PostgreSQL health check to pass)
- Port conflicts
- Invalid configuration

### Debug Mode

```bash
# Run service with debug logging
MICRONAUT_ENVIRONMENTS=dev LOG_LEVEL=DEBUG ./gradlew :services:user-service:run

# Or set in application.yml
micronaut:
  logging:
    level:
      ROOT: DEBUG
      com.girly: TRACE
```

---

## Production Deployment

### Prerequisites

1. **Domain Name** with DNS configured
2. **SSL Certificates** (Traefik can handle Let's Encrypt automatically)
3. **Docker Swarm** or **Kubernetes** (for production orchestration)
4. **Monitoring Setup** (Prometheus + Grafana configured)
5. **Backup Strategy** for databases and volumes

### Steps

1. **Set environment variables**:
   ```bash
   # Create .env file
   cp .env.example .env
   # Edit with your production values
   nano .env
   ```

2. **Build production images**:
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

3. **Start production stack**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Configure Traefik for SSL**:
   Update `docker-compose.prod.yml` with your:
   - Domain name
   - Email for Let's Encrypt
   - Basic auth credentials for Traefik dashboard

5. **Verify deployment**:
   ```bash
   # Check all services
docker-compose -f docker-compose.prod.yml ps

   # Access Traefik dashboard
   # URL: https://traefik.yourdomain.com
   ```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Database
DB_USER=girly
DB_PASSWORD=your-secure-password
POSTGRES_PASSWORD=your-secure-password

# JWT Secret (generate with: openssl rand -base64 64)
JWT_SECRET=your-long-random-secret-key

# Traefik Dashboard (generate hashed password with: htpasswd)
TRAEFIK_USER=admin
TRAEFIK_HASHED_PASSWORD=your-htpasswd-hash

# Let's Encrypt
ACME_EMAIL=admin@girly.tech

# Log level
LOG_LEVEL=INFO
```

---

## Monitoring & Observability

### Prometheus
- URL: http://localhost:9090 (dev) or https://prometheus.yourdomain.com (prod)
- Scrapes metrics from all services automatically
- Custom queries can be created for specific insights

### Grafana
- URL: http://localhost:3000 (dev) or https://grafana.yourdomain.com (prod)
- Username: admin
- Password: girly2024 (change in production!)

#### Setting Up Dashboards

1. **Import Pre-configured Dashboards**:
   - Go to Dashboards > Import
   - Use dashboard JSON files from `docker/grafana/provisioning/dashboards/`

2. **Create Custom Dashboards**:
   - Use Prometheus as data source
   - Common metrics to monitor:
     - HTTP request rates
     - Error rates
     - Response times
     - Database connection counts
     - JVM memory usage
     - GC activity

### Alerts

Configure alerts in Prometheus:

```yaml
# In docker/prometheus/prometheus.yml
rule_files:
  - /etc/prometheus/alerts.yml

# alerts.yml
groups:
- name: girly-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_server_requests_seconds_count{status=~"5.."}[1m]) / rate(http_server_requests_seconds_count[1m]) > 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate on {{ $labels.instance }}"
      description: "Error rate is {{ $value }} (10% threshold)"
```

---

## CI/CD Setup

### GitHub Actions Example

```yaml
# .github/workflows/build-and-test.yml
name: Build and Test

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: girly
          POSTGRES_PASSWORD: girly2024
          POSTGRES_DB: girly
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Set up JDK 17
        uses: actions/setup-java@v3
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'gradle'
      
      - name: Grant execute permission for gradlew
        run: chmod +x gradlew
      
      - name: Build with Gradle
        run: ./gradlew build
      
      - name: Run tests
        run: ./gradlew test
```

### Docker Hub Deployment

```yaml
# .github/workflows/docker-publish.yml
name: Docker Publish

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_TOKEN }}
      
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: girly/user-service:latest,girly/user-service:${{ github.sha }}
```

---

## Security Best Practices

### Secrets Management

1. **Never commit secrets to Git**:
   - Use `.gitignore` for sensitive files
   - Use environment variables
   - Use secret management tools (Vault, AWS Secrets Manager)

2. **Database Security**:
   - Use strong passwords
   - Rotate credentials regularly
   - Use connection pooling with SSL

3. **API Security**:
   - Always use HTTPS in production
   - Implement rate limiting
   - Validate all inputs
   - Sanitize outputs
   - Use prepared statements (prevent SQL injection)

4. **Authentication**:
   - Use strong JWT secrets
   - Set appropriate token expiration times
   - Implement refresh token rotation
   - Store passwords securely (hashed, never plain text)

### Production Checklist

- [ ] All secrets are in environment variables or secret manager
- [ ] Database backups are configured
- [ ] SSL certificates are installed (Traefik handles Let's Encrypt)
- [ ] Monitoring and alerts are configured
- [ ] Logging is configured (with appropriate log levels)
- [ ] Rate limiting is enabled
- [ ] CORS is properly configured
- [ ] Input validation is implemented
- [ ] Error handling doesn't expose sensitive information
- [ ] Health checks are configured for all services
- [ ] Auto-scaling is configured (if using Kubernetes/Swarm)
- [ ] Zero-downtime deployment is configured

---

## Performance Optimization

### Service-Level Optimizations

1. **Database**:
   - Use connection pooling (HikariCP configured in application.yml)
   - Add appropriate indexes
   - Use appropriate fetch strategies (LAZY vs EAGER)
   - Implement caching for frequent queries

2. **Caching**:
   - Redis is configured for session caching
   - Add application-level caching for expensive operations
   - Use `@Cacheable` annotation (Micronaut)

3. **API**:
   - Implement pagination for list endpoints
   - Use compression (GZIP)
   - Optimize JSON serialization
   - Use appropriate HTTP methods and status codes

### Platform-Level Optimizations

1. **Docker**:
   - Use multi-stage builds (already configured in Dockerfiles)
   - Use Alpine-based images where possible
   - Set resource limits (CPU, memory)
   - Configure health checks

2. **Traefik**:
   - Configure rate limiting
   - Enable compression
   - Configure timeouts appropriately
   - Use circuit breakers

3. **Database**:
   - Configure PostgreSQL for optimal performance
   - Use appropriate work_mem, shared_buffers settings
   - Set up proper indexes
   - Consider read replicas for read-heavy workloads

---

## Additional Resources

### Documentation
- [Micronaut Documentation](https://micronaut.io/documentation.html)
- [Micronaut Data](https://micronaut.io/micronaut-data/latest/guide/index.html)
- [Micronaut Security](https://micronaut.io/micronaut-security/latest/guide/index.html)
- [Micronaut Swagger](https://micronaut.io/micronaut-swagger/latest/guide/index.html)

### Docker
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)

### PostgreSQL
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgAdmin](https://www.pgadmin.org/)

### Monitoring
- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/)
- [Grafana Documentation](https://grafana.com/docs/)

### Java
- [Java 17 Documentation](https://docs.oracle.com/en/java/javase/17/)
- [Effective Java](https://www.oracle.com/java/technologies/java-se-books.html) (Book recommendation)

---

## Support

### Getting Help

1. **Check the logs**: Most issues can be diagnosed from service logs
2. **Review this guide**: Many common issues are covered above
3. **Community**: Ask questions in the project's discussion forums
4. **Documentation**: Refer to official Micronaut and Spring documentation

### Debugging Tips

```bash
# View logs for a specific service
docker logs -f girly-user-service

# View logs with timestamps
docker logs -ft girly-user-service

# Execute command in running container
docker exec -it girly-user-service bash

# Check network connectivity
docker exec -it girly-user-service ping postgres

docker exec -it girly-user-service curl -v http://postgres:5432

# Check database tables
docker exec -it girly-postgres psql -U girly -d girly -c "\dt user_svc.*"
```

---

## Next Steps

Once you have the platform running, here are some suggested next steps:

1. **Explore the Research Document**: Read `RESEARCH.md` to understand the full vision
2. **Try the Services**: Test each service endpoint using the API documentation
3. **Implement a Feature**: Pick a feature from the research and implement it
4. **Customize**: Modify the configuration to suit your needs
5. **Deploy**: Set up production deployment
6. **Contribute**: Help improve the platform by contributing code or documentation

---

## Conclusion

You should now have a fully functional Girly Microservices Platform running in development mode. This platform provides a solid foundation for building a comprehensive suite of services that authentically serve the diverse needs of girls and women.

**Remember**: The goal is to create technology that serves humanity - all the messy, beautiful, complicated emotions that make us who we are. Keep this philosophy at the heart of everything you build on this platform.

Happy coding! 🎨✨
