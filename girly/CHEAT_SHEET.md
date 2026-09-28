# Girly Microservices - Developer Cheat Sheet

## 🚀 Quick Start

```bash
# 1. Start infrastructure
docker-compose -f docker-compose.infra.yml up -d

# 2. Build project
./gradlew build

# 3. Run a service (e.g., user-service)
./gradlew :services:user-service:run

# 4. Test it
curl http://localhost:8080/health
```

---

## 📁 Project Structure

```
girly/
├── README.md              # Vision & architecture
├── SETUP_GUIDE.md         # Full setup instructions
├── RESEARCH.md            # User needs research
├── PROJECT_SUMMARY.md     # What was created
├── CHEAT_SHEET.md         # This file
│
├── build.gradle
├── settings.gradle
├── gradlew
│
├── docker-compose.*       # Docker configs
│
├── lib/                   # Common libraries
│   ├── girly-common/      # Constants, exceptions, utils
│   ├── girly-db/          # Database layer
│   ├── girly-models/      # Shared entities
│   └── girly-events/      # Event definitions
│
└── services/              # Microservices
    ├── user-service/      # Port 8001
    ├── pet-service/       # Port 8002
    ├── wardrobe-service/  # Port 8003
    ├── makeup-service/    # Port 8004
    ├── drama-service/     # Port 8005
    ├── social-service/    # Port 8006
    ├── mood-service/      # Port 8007
    └── aggregate-service/ # Port 8008
```

---

## 🎯 Service Ports (Development)

| Service | Port | Traefik Path | Description |
|---------|------|--------------|-------------|
| user-service | 8001 | `/api/v1/auth`, `/api/v1/users` | Authentication & users |
| pet-service | 8002 | `/api/v1/pets` | Virtual pets |
| wardrobe-service | 8003 | `/api/v1/wardrobe` | Fashion & clothing |
| makeup-service | 8004 | `/api/v1/makeup` | Beauty & makeup |
| drama-service | 8005 | `/api/v1/drama` | Life simulation |
| social-service | 8006 | `/api/v1/social`, `/ws` | Games & social |
| mood-service | 8007 | `/api/v1/mood` | Emotional support |
| aggregate-service | 8008 | `/api/v1/aggregate` | Data aggregation |

---

## 🏗️ Common Commands

### Build
```bash
# Build everything
./gradlew build

# Build specific service
./gradlew :services:user-service:build

# Clean build
./gradlew clean build

# Build without tests
./gradlew build -x test

# Refresh dependencies
./gradlew clean build --refresh-dependencies
```

### Run
```bash
# Run specific service
./gradlew :services:user-service:run

# Run in dev mode (hot reload)
MICRONAUT_ENVIRONMENTS=dev ./gradlew :services:user-service:run

# Run all services
./gradlew runAll
```

### Test
```bash
# Run all tests
./gradlew test

# Run specific service tests
./gradlew :services:user-service:test

# Run specific test class
./gradlew :services:user-service:test --tests "com.girly.user.controller.*"

# Run with coverage
./gradlew test --info --tests "*" --stacktrace
```

### Docker
```bash
# Start infrastructure
docker-compose -f docker-compose.infra.yml up -d

# Start all services (dev)
docker-compose -f docker-compose.dev.yml up -d

# Start all services (prod)
docker-compose -f docker-compose.prod.yml up -d

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# View logs
docker logs -f girly-user-service

# Execute command in container
docker exec -it girly-user-service bash

# Check running containers
docker ps

# Check all containers
docker ps -a

# Restart service
docker restart girly-user-service
```

### Database
```bash
# Connect to PostgreSQL
docker exec -it girly-postgres psql -U girly -d girly

# List schemas
\dn

# Connect to specific schema
\c girly
SET search_path TO user_svc;

# List tables in schema
\dt user_svc.*

# Run SQL file
docker exec -i girly-postgres psql -U girly -d girly < script.sql

# Backup database
docker exec girly-postgres pg_dump -U girly girly > backup.sql

# Restore database
cat backup.sql | docker exec -i girly-postgres psql -U girly girly
```

---

## 🔌 API Endpoints

### User Service
```bash
# Register
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "displayName": "Test User",
  "email": "test@example.com",
  "password": "password123"
}

# Login
POST /api/v1/auth/login
{
  "username": "testuser",
  "password": "password123"
}

# Get current user
GET /api/v1/auth/me
Authorization: Bearer <token>

# Health check
GET /health
```

### Health Checks
```bash
# All services
curl http://localhost:8001/health  # user-service
curl http://localhost:8002/health  # pet-service
curl http://localhost:8003/health  # wardrobe-service
# etc.

# Traefik
curl http://localhost:8080/api/health

# PostgreSQL
docker exec girly-postgres pg_isready -U girly -d girly
```

---

## 📝 Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=jdbc:postgresql://postgres:5432/girly
DATABASE_USER=girly
DATABASE_PASSWORD=girly2024
DATABASE_SCHEMA=user_svc

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key

# Log level
LOG_LEVEL=DEBUG
```

### Application Profiles
```yaml
# application.yml
micronaut:
  environments:
    dev:     # Development
    test:    # Testing
    prod:    # Production
```

### Run with Different Profile
```bash
# Development
MICRONAUT_ENVIRONMENTS=dev ./gradlew run

# Production
MICRONAUT_ENVIRONMENTS=prod ./gradlew run
```

---

## 🐛 Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs girly-postgres

# Test connection
docker exec -it girly-user-service curl -v http://postgres:5432

# Wait for PostgreSQL to be ready
sleep 30 && ./gradlew run
```

### Port Already in Use
```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>

# Or use different port
# In application.yml: micronaut.server.port=8081
```

### Gradle Build Fails
```bash
# Clean and rebuild
./gradlew clean build

# With stacktrace
./gradlew build --stacktrace

# With more info
./gradlew build --info

# Check Java version
java -version
```

### Service Fails to Start
```bash
# Check logs
./gradlew :services:user-service:run --stacktrace

# Or for Docker
docker logs girly-user-service

# Common fixes:
# - Ensure all dependencies are running
# - Check environment variables
# - Verify database schema exists
# - Check port availability
```

### Cannot Connect to Service
```bash
# Check if service is running
docker ps | grep user-service

# Check service logs
docker logs girly-user-service

# Check Traefik logs
docker logs girly-traefik

# Test direct connection (bypass Traefik)
curl http://localhost:8001/health
```

---

## 📊 Monitoring

### Prometheus
```bash
# URL: http://localhost:9090

# Query examples:
# - Up services: up
# - CPU usage: rate(container_cpu_usage_seconds_total[1m])
# - Memory usage: container_memory_working_set_bytes
# - HTTP requests: rate(http_server_requests_seconds_count[1m])
```

### Grafana
```bash
# URL: http://localhost:3000
# Username: admin
# Password: girly2024

# Import dashboards from:
docker/grafana/provisioning/dashboards/
```

### Traefik
```bash
# URL: http://localhost:8080
# Dashboard shows all services, routes, and metrics
```

---

## 🔧 Common Java Patterns

### Create New Entity
```java
@Entity
@Table(name = "items", schema = "wardrobe_svc")
public class Item {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(nullable = false)
    private String name;
    
    // Getters & Setters
}
```

### Create New Repository
```java
@Repository
public interface ItemRepository extends CrudRepository<Item, UUID> {
    List<Item> findByNameContaining(String name);
    List<Item> findByType(String type);
}
```

### Create New Controller
```java
@Controller("/api/v1/items")
public class ItemController {
    @Get("/")
    public List<Item> listAll() {
        return itemRepository.findAll();
    }
    
    @Post("/")
    public HttpResponse<Item> create(@Body Item item) {
        Item saved = itemRepository.save(item);
        return HttpResponse.created(saved);
    }
}
```

### Exception Handling
```java
@Error(global = true)
public HttpResponse<?> handleException(HttpRequest<?> request, 
                                         GirlyException ex) {
    Map<String, Object> error = Map.of(
        "errorCode", ex.getErrorCode(),
        "errorMessage", ex.getErrorMessage(),
        "status", ex.getHttpStatus().getCode()
    );
    return HttpResponse
            .status(ex.getHttpStatus())
            .body(error);
}
```

---

## 💡 Tips & Tricks

### Hot Reload
```bash
# Micronaut supports automatic reload in dev mode
MICRONAUT_ENVIRONMENTS=dev ./gradlew run

# Changes to:
# - Java files: Automatic reload
# - Configuration: Manual restart needed
# - Dependencies: Full rebuild needed
```

### Debug Logging
```bash
# Run with debug logging
LOG_LEVEL=DEBUG ./gradlew run

# Or in application.yml
micronaut:
  logging:
    level:
      ROOT: DEBUG
      com.girly: TRACE
```

### Database Migrations
```bash
# For development, use:
# application.yml
jpa:
  default:
    properties:
      hibernate:
        hbm2ddl:
          auto: update

# For production, use Flyway or Liquibase
```

### Testing with Testcontainers
```java
@Testcontainers
class UserRepositoryTest {
    @Container
    static PostgreSQLContainer<?> postgres = 
        new PostgreSQLContainer<}("postgres:15")
            .withDatabaseName("test")
            .withUsername("test")
            .withPassword("test");
    
    @Test
    void testSomething() {
        // Test code here
    }
}
```

---

## 📚 Useful Resources

### Micronaut
- [Documentation](https://micronaut.io/documentation.html)
- [Guides](https://guides.micronaut.io/)
- [API Docs](https://micronaut.io/api/)
- [GitHub](https://github.com/micronaut-projects/micronaut-core)

### Docker
- [Docker Docs](https://docs.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Traefik](https://doc.traefik.io/traefik/)

### PostgreSQL
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [pgAdmin](https://www.pgadmin.org/)
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)

### Java
- [Java 17 Docs](https://docs.oracle.com/en/java/javase/17/)
- [Java Tutorials](https://docs.oracle.com/javase/tutorial/)
- [Baeldung](https://www.baeldung.com/) (Great tutorials)

---

## 🎓 Best Practices

### Code Quality
- ✅ Follow existing code style
- ✅ Write meaningful commit messages
- ✅ Add tests for new features
- ✅ Update documentation
- ✅ Keep methods small (< 20 lines)
- ✅ Use descriptive variable names

### API Design
- ✅ Use REST conventions
- ✅ Consistent naming (camelCase, plural nouns)
- ✅ Proper HTTP methods (GET, POST, PUT, DELETE)
- ✅ Appropriate status codes
- ✅ Pagination for lists
- ✅ HATEOAS (links in responses)

### Database
- ✅ Use proper indexing
- ✅ Avoid N+1 queries
- ✅ Use transactions appropriately
- ✅ Handle concurrent updates
- ✅ Backup regularly

### Security
- ✅ Always validate inputs
- ✅ Sanitize outputs
- ✅ Use prepared statements
- ✅ Hash passwords (never store plain text)
- ✅ Use HTTPS in production
- ✅ Implement rate limiting

### Performance
- ✅ Use connection pooling
- ✅ Implement caching
- ✅ Optimize queries
- ✅ Use pagination
- ✅ Lazy load relationships
- ✅ Minimize data transfer

---

## 🌟 Emotional Intelligence Features

Remember: The Girly Platform supports the **full spectrum** of emotions:

### Positive Emotions
- Joy, Excitement, Love, Pride, Gratitude, Contentment, Inspiration, Curiosity

### Challenging Emotions
- Sadness, Loneliness, Anxiety, Anger, Boredom, Overwhelm, Guilt, Shame, Grief

### Complex Emotions
- Nostalgia, Hopefulness, Ambivalence, Empathy, Resilience, Vulnerability, Acceptance

**Build features that acknowledge and support ALL of these emotions authentically.**

---

## 💬 Quick Questions & Answers

### Q: How do I add a new service?
**A:**
1. Create directory: `mkdir services/new-service`
2. Create `build.gradle` (copy from existing service)
3. Create `Application.java` (copy from existing service)
4. Update `settings.gradle` to include the new service
5. Add to Docker Compose files

### Q: How do I connect to PostgreSQL?
**A:**
```yaml
# application.yml
datasources:
  default:
    url: jdbc:postgresql://postgres:5432/girly
    username: girly
    password: girly2024
    schema: your_service_svc
```

### Q: How do I use Redis?
**A:**
```yaml
# application.yml
redis:
  servers:
    default:
      host: redis
      port: 6379
```
```java
@Inject
RedisClient redisClient;
```

### Q: How do I implement authentication?
**A:**
```yaml
# application.yml
micronaut:
  security:
    enabled: true
    token:
      jwt:
        enabled: true
```
```java
@Secured(SecurityRule.IS_AUTHENTICATED)
@Get("/protected")
public String protectedEndpoint() {
    return "Protected!";
}
```

### Q: How do I call another service?
**A:**
```java
@Inject
@Client("http://user-service:8080")
HttpClient httpClient;

public User getUser(UUID id) {
    return httpClient.retrieve(
        "/api/v1/users/" + id,
        User.class
    );
}
```

### Q: How do I add a new endpoint?
**A:**
```java
@Controller("/api/v1/items")
public class ItemController {
    
    @Get("/{id}")
    public HttpResponse<Item> getById(UUID id) {
        Item item = itemRepository.findById(id)
            .orElseThrow(() -> new GirlyException.NotFound("Item", id.toString()));
        return HttpResponse.ok(item);
    }
}
```

---

## 📞 Need Help?

1. **Check this cheat sheet** - Most common questions are here
2. **Read SETUP_GUIDE.md** - Detailed setup instructions
3. **Review RESEARCH.md** - Understand the platform philosophy
4. **Check logs** - `docker logs <service-name>`
5. **Check health** - `curl http://localhost:8001/health`
6. **Google it** - Most issues have solutions online
7. **Ask for help** - Open a GitHub issue or ask in Discord

---

## 🎉 You're Ready!

You now have everything you need to:

✅ Understand the project structure  
✅ Start and stop services  
✅ Build and test the project  
✅ Debug common issues  
✅ Add new features  
✅ Deploy to production  

**Go build something amazing that helps girls and women thrive!** 💜✨
