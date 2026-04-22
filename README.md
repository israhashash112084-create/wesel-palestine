# Wasel Palestine API — System Architecture

> Generated: February 28, 2026  
> Purpose: Complete architecture reference for all team members.

---

## Table of Contents

1. [Architecture Style](#1-architecture-style-modular-monolith)
2. [The Big Picture](#2-the-big-picture)
3. [Layer by Layer Explanation](#3-layer-by-layer-explanation)
   - [Layer 1 — Route / Controller Layer](#layer-1--route--controller-layer)
   - [Layer 2 — Service Layer](#layer-2--service-layer)
   - [Layer 3 — Repository Layer](#layer-3--repository-layer)
   - [Layer 4 — Integration Layer](#layer-4--integration-layer)
   - [Layer 5 — Background Job Layer](#layer-5--background-job-layer-bullmq)
4. [Data Flow for Each Module](#4-data-flow-for-each-module)
5. [Security Architecture](#5-security-architecture)
6. [Deployment Architecture](#6-deployment-architecture-docker)
7. [Why This Architecture Scores Well](#7-why-this-architecture-scores-well)

---

## 1. Architecture Style: Modular Monolith

This is the correct choice for your project. Here is why:

```
Microservices   → too complex for a 4-person student team, overkill
Pure Monolith   → no internal boundaries, hard to split work between 4 members
Modular Monolith → clear module boundaries, single deployable unit,
                   each member owns their module independently
```

---

## 2. The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONSUMERS                                │
│   Mobile App    Web Dashboard    Third-party Systems            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REVERSE PROXY                               │
│                      (Docker / Nginx)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  WASEL PALESTINE API                            │
│                  Node.js + Express 5                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  GLOBAL MIDDLEWARE                       │   │
│  │  Helmet  CORS  RateLimit  CookieParser  Morgan  Joi      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   API LAYER  /api/v1/                   │   │
│  │                                                         │   │
│  │  /auth        /checkpoints   /incidents                 │   │
│  │  /reports     /routes        /alerts                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  MODULE LAYER                           │   │
│  │                                                         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐            │   │
│  │  │   Auth    │ │Checkpoints│ │ Incidents │            │   │
│  │  │controller │ │controller │ │controller │            │   │
│  │  │  service  │ │  service  │ │  service  │            │   │
│  │  │   repo    │ │   repo    │ │   repo    │            │   │
│  │  └───────────┘ └───────────┘ └───────────┘            │   │
│  │                                                         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐            │   │
│  │  │  Reports  │ │  Routes   │ │  Alerts   │            │   │
│  │  │controller │ │controller │ │controller │            │   │
│  │  │  service  │ │  service  │ │  service  │            │   │
│  │  │   repo    │ │           │ │   repo    │            │   │
│  │  └───────────┘ └───────────┘ └───────────┘            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                INTEGRATION LAYER                        │   │
│  │                                                         │   │
│  │       OSRM Client          OpenWeatherMap Client        │   │
│  │       routing.cache.js     weather.cache.js             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              BACKGROUND JOB LAYER (BullMQ)              │   │
│  │                                                         │   │
│  │              alerts.worker.js                           │   │
│  │         (triggered by incident events)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────┬───────────────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐   ┌──────────────────────┐
│     PostgreSQL 16    │   │      Redis 7          │
│                      │   │                       │
│  users               │   │  JWT blacklist        │
│  refresh_tokens      │   │  Route cache (10min)  │
│  checkpoints         │   │  Weather cache(30min) │
│  checkpoints_history │   │  BullMQ job queues    │
│  incidents           │   │  Rate limit counters  │
│  incidents_history   │   └──────────────────────┘
│  reports             │
│  report_votes        │   ┌──────────────────────┐
│  moderation_audit    │   │   External APIs       │
│  alert_subscriptions │   │                       │
│  alerts              │   │  OSRM / ORS           │
└──────────────────────┘   │  OpenWeatherMap       │
                           └──────────────────────┘
```

---

## 3. Layer by Layer Explanation

---

### Layer 1 — Route / Controller Layer

**Responsibility:** Receive HTTP request, validate input, call service, return HTTP response. Nothing else.

```javascript
// Example: incidents.controller.js
export const getIncidents = async (req, res) => {
  const filters = req.query;                        // already validated by Joi
  const { page, limit } = getPaginationParams(req.query);
  const result = await incidentsService.listIncidents(filters, page, limit);
  res.json(result);                                 // just returns, no logic here
};
```

**Rules:**
- No database calls directly
- No business logic
- No direct calls to external APIs
- Only talks to its own service

---

### Layer 2 — Service Layer

**Responsibility:** Business logic. Orchestrates repositories and integrations. Makes decisions.

```javascript
// Example: routes.service.js
export const estimateRoute = async (from, to, options) => {
  const cacheKey = buildCacheKey(from, to, options);
  const cached = await routingCache.get(cacheKey);    // check cache first
  if (cached) return cached;

  const roadData    = await osrmClient.getRoute(from, to);           // external API
  const incidents   = await incidentsRepo.findNearRoute(from, to);   // DB
  const checkpoints = await checkpointsRepo.findOnRoute(from, to);   // DB
  const weather     = await weatherClient.getWeather(to);            // external API

  const result = composeRouteResponse(roadData, incidents, checkpoints, weather);
  await routingCache.set(cacheKey, result, 600);      // cache 10 min
  return result;
};
```

**Rules:**
- No `req` or `res` objects — pure input/output functions
- Can call multiple repositories
- Can call integrations
- Contains all business rules (delay calculations, duplicate detection, etc.)

---

### Layer 3 — Repository Layer

**Responsibility:** All database interaction. Raw SQL queries only. Returns plain objects.

```javascript
// Example: incidents.repository.js
export const findAll = async (filters, limit, offset) => {
  const { rows } = await query(
    `SELECT i.*, u.name as created_by_name
     FROM incidents i
     JOIN users u ON i.created_by = u.id
     WHERE ($1::text IS NULL OR i.type = $1)
     AND   ($2::text IS NULL OR i.severity = $2)
     AND   ($3::text IS NULL OR i.area ILIKE $3)
     AND   ($4::text IS NULL OR i.status = $4)
     ORDER BY i.created_at DESC
     LIMIT $5 OFFSET $6`,
    [filters.type, filters.severity, filters.area, filters.status, limit, offset]
  );
  return rows;
};
```

**Rules:**
- Only talks to PostgreSQL
- No business logic whatsoever
- Uses parameterized queries always (SQL injection prevention)
- Both raw queries and ORM-style patterns as required by the project spec

---

### Layer 4 — Integration Layer

**Responsibility:** Talk to external APIs. Handle their failures gracefully.

```javascript
// Example: osrm.client.js
export const getRoute = async (from, to) => {
  try {
    const response = await axios.get(
      `http://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}`,
      { timeout: 3000 }                              // 3 second hard timeout
    );
    return response.data;
  } catch (err) {
    // fallback: straight-line Haversine distance
    return buildFallbackRoute(from, to);
  }
};
```

**Rules:**
- Always has a timeout
- Always has a fallback
- Caches responses in Redis before returning
- Never lets external failure crash your API

---

### Layer 5 — Background Job Layer (BullMQ)

**Responsibility:** Process async work that should not block HTTP responses.

```
HTTP Request completes immediately
        │
        └── BullMQ pushes job to Redis queue
                  │
                  └── Worker picks up job (separate process)
                            │
                            └── Does the slow work:
                                  query subscriptions
                                  insert alert records
                                  (future: send push notifications)
```

**Why this matters for your grade:** The alert system would be broken without this.
You cannot query all subscriptions and insert alerts inside an HTTP request — it
would be too slow for high traffic (k6 tests would expose this).

---

## 4. Data Flow for Each Module

```
REQUEST LIFECYCLE
─────────────────

Incoming HTTP Request
        │
        ▼
[Global Middleware]
  Helmet        (security headers)
  CORS          (allowed origins)
  RateLimit     (too many requests → 429)
  CookieParser  (reads HttpOnly cookies)
  Morgan        (logs the request)
  express.json  (parses body)
        │
        ▼
[Route Handler]
  Matches /api/v1/incidents → incidents router
        │
        ▼
[Auth Middleware] (if route requires it)
  authenticate.js → verifies JWT → attaches req.user
  requireRole.js  → checks req.user.role
        │
        ▼
[Validation Middleware]
  Joi schema validates req.body / req.query / req.params
  Invalid → 400 Bad Request immediately
        │
        ▼
[Controller]
  Extracts validated data
  Calls service function
  Returns res.json()
        │
        ▼
[Service]
  Business logic
  Calls repository / integration / cache
        │
        ▼
[Repository]              [Integration]
  PostgreSQL query    OR    OSRM / Weather API call
        │                         │
        └──────────┬──────────────┘
                   ▼
              [Redis Cache]
           check before DB/API call
           store result after
                   │
                   ▼
[Response assembled in Service]
        │
        ▼
[Controller sends HTTP response]
        │
        ▼
[Error Handler] (if anything threw)
  AppError → structured JSON { status, message }
  Unknown  → 500 Internal Server Error
```

---

## 5. Security Architecture

```
┌─────────────────────────────────────────────────┐
│              SECURITY LAYERS                    │
│                                                 │
│  1. Helmet          → HTTP security headers     │
│  2. CORS            → whitelist allowed origins │
│  3. Rate Limiter    → prevent brute force/DDoS  │
│  4. Joi             → reject malformed input    │
│  5. JWT             → stateless auth            │
│  6. bcryptjs        → passwords never stored    │
│                        in plain text            │
│  7. Parameterized   → prevent SQL injection     │
│     SQL queries                                 │
│  8. HttpOnly        → XSS cannot steal tokens   │
│     Cookies                                     │
│  9. requireRole()   → RBAC per endpoint         │
│ 10. Refresh token   → rotated on every use      │
│     rotation          (stolen token detection)  │
└─────────────────────────────────────────────────┘
```

### JWT Token Flow

```
POST /auth/login
        │
        ├── Verify password with bcryptjs
        ├── Issue accessToken  (JWT, 15 min, stored in HttpOnly cookie)
        └── Issue refreshToken (JWT, 7 days, hashed and stored in DB)

Every protected request
        │
        └── authenticate.js reads accessToken from cookie
              └── jwt.verify() → attach req.user → continue

POST /auth/refresh
        │
        ├── Verify refreshToken from cookie
        ├── Delete old refreshToken from DB
        └── Issue new accessToken + new refreshToken (rotation)

POST /auth/logout
        │
        ├── Delete refreshToken from DB
        └── Clear both cookies
```

### Role-Based Access Control (RBAC)

```
Role: citizen
  → POST /reports
  → POST /reports/:id/vote
  → GET  /reports/nearby
  → POST /alerts/subscriptions
  → GET  /alerts
  → GET  /checkpoints
  → GET  /incidents

Role: moderator (extends citizen)
  → GET    /reports           (moderation queue)
  → GET    /reports/:id
  → PATCH  /reports/:id/moderate
  → POST   /incidents
  → PATCH  /incidents/:id
  → PATCH  /checkpoints/:id/status

Role: admin (extends moderator)
  → POST   /checkpoints
  → DELETE anything
  → User management
```

---

## 6. Deployment Architecture (Docker)

```
docker-compose.yml
│
├── api          (Node.js container, port 3000)
│    └── depends on: postgres (healthy), redis (healthy)
│
├── postgres     (PostgreSQL 16 container, port 5432)
│    └── volume: pgdata (data persists between restarts)
│
└── redis        (Redis 7 container, port 6379)
     └── used for: cache + BullMQ queues + rate limit counters

All three containers share one internal Docker network.
Only the api container is exposed to the outside world.
```

### Container Communication

```
┌─────────────┐     HTTP :3000      ┌─────────────┐
│   Outside   │ ──────────────────► │     api     │
│    World    │                     │  container  │
└─────────────┘                     └──────┬──────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                          ▼                ▼                ▼
                   :5432 postgres    :6379 redis      (internal only)
                    container        container
```

### Environment Variables Reference

```bash
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://wasel:password@postgres:5432/wasel_db

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_ACCESS_SECRET=min_32_chars_secret
JWT_REFRESH_SECRET=min_32_chars_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# External APIs
OPENWEATHERMAP_API_KEY=your_key_here
OPENROUTESERVICE_API_KEY=your_key_here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## 7. Why This Architecture Scores Well

| Criteria | Weight | How This Architecture Addresses It |
|---|---|---|
| **API Design & Architecture** | 30% | Clean layered separation, versioned routes `/api/v1/`, consistent error format, RESTful conventions throughout |
| **Performance & Load Analysis** | 20% | Redis caching on all external calls, BullMQ for async work, pg connection pooling (max 20), cache-aside pattern |
| **Database** | 15% | Repository pattern isolates all SQL, migrations version the schema, both raw queries and structured access |
| **Correctness & Security** | 10% | JWT + RBAC + parameterized queries + Helmet + HttpOnly cookies covers all attack vectors |
| **Version Control** | 10% | Modular structure maps directly to feature branches — each member owns isolated files |
| **Documentation** | 10% | Each layer has one clear responsibility — straightforward to document and diagram |
| **External API Integrations** | 5% | Integration layer isolates external calls with timeouts, fallbacks, and Redis caching |

---

## Appendix — File Responsibility Map

```
src/
├── config/          → environment, DB pool, Redis client, BullMQ queues
├── database/
│   ├── client.js    → pg pool + withTransaction helper
│   └── migrations/  → versioned schema changes (never edit, only add)
├── modules/
│   └── [name]/
│       ├── *.controller.js  → HTTP in/out only
│       ├── *.service.js     → business logic
│       ├── *.repository.js  → SQL queries
│       ├── *.routes.js      → Express router + middleware chain
│       ├── *.validator.js   → Joi schemas
│       └── *.worker.js      → BullMQ job processor (alerts only)
├── integrations/
│   ├── routing/     → OSRM client + Redis cache wrapper
│   └── weather/     → OpenWeatherMap client + Redis cache wrapper
└── shared/
    ├── middleware/  → authenticate, requireRole, errorHandler
    └── utils/       → AppError, pagination helpers
```
