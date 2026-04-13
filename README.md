🗺️ Wesel Palestine — Backend API
A real-time traffic and checkpoint monitoring system for the West Bank. Built with Node.js, PostgreSQL, Redis, and BullMQ.

📋 Table of Contents

System Overview
Architecture Diagram
Database Schema (ERD)
API Design Rationale
External API Integration Details
Testing Strategy
Performance Testing Results


🧩 System Overview
Wesel Palestine is a backend REST API that helps users navigate the West Bank by providing:

Real-time checkpoint status — open, closed, slow, unknown
Incident reporting — users report accidents, closures, delays, and military activity
Smart route estimation — calculates optimal routes while avoiding checkpoints and hazardous areas
Alert subscriptions — users subscribe to area-based alerts and receive notifications when incidents are verified
Community moderation — reports are verified/rejected via voting or moderator action

🛠️ Tech Stack
LayerTechnologyRuntimeNode.js (ESM)FrameworkExpress.jsDatabasePostgreSQL (via Prisma ORM)CacheRedis (via ioredis)Job QueueBullMQRouting EngineOSRM (Open Source Routing Machine)WeatherOpenWeatherMap APIValidationJoiAuthJWT (Access + Refresh tokens)
📦 Modules
ModuleResponsibilityauthRegistration, login, logout, token refreshcheckpointsCheckpoint CRUD and status managementincidentsIncident lifecycle and moderationreportsCommunity reports, voting, auto-moderationroutesRoute estimation, history, area statusalertsSubscriptions and incident notifications

🏗️ Architecture Diagram
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│                  (Mobile / Web App)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS.JS API                            │
│                                                             │
│  ┌─────────┐ ┌───────────┐ ┌─────────┐ ┌────────────────┐ │
│  │  Auth   │ │Checkpoints│ │Incidents│ │    Reports     │ │
│  └─────────┘ └───────────┘ └─────────┘ └────────────────┘ │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │       Routes         │  │          Alerts              │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────┐     ┌───────────────────────┐
│   PostgreSQL DB   │     │    Redis Cache        │
│   (via Prisma)    │     │  + BullMQ Job Queue   │
└───────────────────┘     └──────────┬────────────┘
                                     │
                          ┌──────────▼────────────┐
                          │     BullMQ Workers    │
                          │  - Report Worker      │
                          │  - Alerts Worker      │
                          └──────────┬────────────┘
                                     │
               ┌─────────────────────┴───────────────────┐
               ▼                                         ▼
┌──────────────────────────┐             ┌───────────────────────────┐
│   OSRM Routing Engine    │             │  OpenWeatherMap API       │
│  (Route calculation)     │             │  (Weather conditions)     │
└──────────────────────────┘             └───────────────────────────┘
Request Flow
Client Request
    → Auth Middleware (JWT validation)
    → Validation Middleware (Joi)
    → Rate Limit Middleware
    → Controller
    → Service (business logic)
    → Repository (database)
    → Response
Background Jobs Flow
Report Submitted
    → BullMQ: scheduleCreateIncident()
    → BullMQ: scheduleAutoReject() [12hr delay]

Incident Verified
    → BullMQ: addIncidentAlertsJob()
    → AlertsWorker: processIncidentAlerts()
    → BullMQ: addSendAlertJob() [per subscriber]
    → AlertsWorker: sendAlert()

🗄️ Database Schema (ERD)
┌──────────────────┐         ┌──────────────────┐
│      users       │         │   checkpoints    │
├──────────────────┤         ├──────────────────┤
│ id (UUID) PK     │────┐    │ id (INT) PK      │
│ email            │    │    │ name             │
│ password_hash    │    │    │ area             │
│ first_name       │    │    │ road             │
│ last_name        │    │    │ city             │
│ role             │    │    │ latitude         │
│ confidence_score │    │    │ longitude        │
│ created_at       │    │    │ status           │
└──────────────────┘    │    │ created_by (FK)──┼──► users
                        │    └──────────────────┘
                        │
                        │    ┌──────────────────┐
                        │    │    incidents     │
                        │    ├──────────────────┤
                        ├───►│ id (INT) PK      │
                        │    │ checkpoint_id FK ─┼──► checkpoints
                        │    │ reported_by FK ───┼──► users
                        │    │ moderated_by FK ──┼──► users
                        │    │ location_lat      │
                        │    │ location_lng      │
                        │    │ type              │
                        │    │ severity          │
                        │    │ status            │
                        │    │ traffic_status    │
                        │    └──────────────────┘
                        │
                        │    ┌──────────────────┐
                        │    │     reports      │
                        │    ├──────────────────┤
                        ├───►│ id (INT) PK      │
                        │    │ user_id FK ───────┼──► users
                        │    │ incident_id FK ───┼──► incidents
                        │    │ checkpoint_id FK ─┼──► checkpoints
                        │    │ duplicate_of FK ──┼──► reports (self)
                        │    │ location_lat      │
                        │    │ location_lng      │
                        │    │ type              │
                        │    │ severity          │
                        │    │ status            │
                        │    │ confidence_score  │
                        │    └──────────────────┘
                        │
                        │    ┌──────────────────────┐
                        │    │  alert_subscriptions │
                        │    ├──────────────────────┤
                        ├───►│ id (INT) PK          │
                        │    │ user_id FK ───────────┼──► users
                        │    │ area_lat              │
                        │    │ area_lng              │
                        │    │ radius_km             │
                        │    │ category              │
                        │    │ is_active             │
                        │    └──────────────────────┘
                        │
                        │    ┌──────────────────┐
                        │    │  route_history   │
                        │    ├──────────────────┤
                        └───►│ id (INT) PK      │
                             │ user_id FK ───────┼──► users
                             │ from_lat/lng      │
                             │ to_lat/lng        │
                             │ distance_km       │
                             │ final_duration    │
                             │ total_delay       │
                             │ is_fallback       │
                             └──────────────────┘

Supporting Tables:
- report_votes          (user votes on reports)
- moderation_audit_log  (report moderation history)
- checkpoint_status_history
- checkpoint_audit_log
- incident_status_history
- alerts                (incident → subscription alerts)
- report_notifications  (report status notifications)
- route_cache           (cached route results)
- external_api_logs     (OSRM + weather API logs)
- refresh_tokens        (JWT refresh tokens)
Key Enums
EnumValuesRoleuser, moderator, adminIncidentTypeclosure, delay, accident, military_activity, weather_hazard, road_damage, protest, construction, checkpoint_status_update, otherIncidentSeveritylow, medium, high, criticalIncidentStatuspending, verified, rejected, closedTrafficStatusopen, closed, slow, unknownReportStatuspending, verified, rejected

🎯 API Design Rationale
Why REST?
The API follows standard REST conventions with resource-based URLs, making it predictable and easy to consume by mobile and web clients.
Authentication Flow

Access Token (JWT, short-lived: 15 minutes) — sent in Authorization: Bearer header
Refresh Token (hashed, long-lived: 7 days) — stored in DB, used to issue new access tokens
Each device gets its own refresh token identified by deviceId

Role-Based Access
RoleCapabilitiesuserSubmit reports, vote, estimate routes, manage subscriptionsmoderatorEverything above + moderate reports and incidentsadminEverything above + manage checkpoints
Report Auto-Moderation Logic
Reports go through an automated pipeline:
Submit Report
    ↓
Check for duplicates (500m radius, 1hr window)
    ↓ if duplicate → link to original report
    ↓ if new → schedule incident creation + auto-reject (12hr)
    ↓
Community Voting
    ↓
If ≥4 votes:
    - upvotes ≥ 70% → Auto-Verified
    - upvotes < 30% → Auto-Rejected
Route Estimation Strategy
1. Query OSRM for multiple routes
2. Filter routes that avoid selected checkpoints/areas
3. If no valid route → try detour via waypoints (Plan B)
4. If still no valid route → use best available route with warning
5. If OSRM fails → Haversine straight-line fallback
6. Apply delay penalties: checkpoints + incidents + weather
7. Cache result (10min if incidents present, 60min if clear)
Caching Strategy
DataCacheTTLRoute results (clear)Redis60 minRoute results (with incidents)Redis10 minReport listRedis (versioned)2 minSingle reportRedis3 min

🔌 External API Integration Details
1. OSRM (Open Source Routing Machine)
PropertyDetailPurposeRoad-based route calculationEndpoint/route/v1/driving/{lng},{lat};{lng},{lat}ResponseDistance (km), duration (min), route geometry (GeoJSON)FallbackHaversine straight-line distance if OSRM unavailableLoggingEvery call logged in external_api_logs table
Used for:

Route estimation between two points
Detour route calculation (via waypoints to avoid checkpoints/areas)
Checking if route passes near checkpoints (1.5km radius)

2. OpenWeatherMap API
PropertyDetailPurposeWeather conditions along routeEndpoint/weather?lat={lat}&lon={lng}ResponseWeather condition, description, isHazardous flagFallbackRoute calculated without weather factorDelay Added+10 minutes if weather is hazardousLoggingEvery call logged in external_api_logs table
Used for:

Checking weather at route midpoint
Adding delay warnings for hazardous weather conditions


🧪 Testing Strategy
All APIs were tested using API-Dog with the following approach:
Test Environment

Base URL: http://localhost:3000/api/v1
Auth: JWT Bearer token, auto-saved via Post Processor script after login

Test Categories
✅ Happy Path Tests (Success Cases)
Each endpoint tested with valid data to confirm correct response and status code.
ModuleEndpoints TestedAuthRegister, Login, Refresh Token, Logout, Get ProfileCheckpointsCreate, List, Get by ID, Nearby, Update, Status History, DeleteIncidentsCreate, List, Get by ID, Nearby, Close, Update, Status HistoryReportsSubmit, List, Get by ID, Vote, Update, ModerateRoutesEstimate, Compare, History, History Stats, Areas Status, Active Checkpoints, Active IncidentsAlertsCreate Subscription, Get Subscriptions, Update, Deactivate, Get Alerts, Mark as Read
❌ Error Case Tests (Failure Cases)
Each endpoint tested for expected error responses:
ErrorHow Triggered400 Bad RequestMissing required fields, invalid data format401 UnauthorizedMissing or invalid JWT token403 ForbiddenRegular user accessing moderator endpoints404 Not FoundNon-existent resource ID (e.g., id=99999)409 ConflictSubmitting duplicate report in same area
🔐 Auth Flow Tests

Login → token auto-saved → subsequent requests use token
Expired token → 401 returned
Moderator token → access to moderation endpoints

Test Execution Order
1. Register User
2. Login → save token
3. Create Checkpoint (admin)
4. Submit Report (user)
5. Vote on Report
6. Moderate Report (moderator)
7. Estimate Route
8. Create Alert Subscription
9. Get My Alerts

📊 Performance Testing Results
Performance and load testing was conducted using Grafana k6 v1.7.1.

📁 k6 test scripts are located in /k6-tests:

read-heavy.js — 20 concurrent users reading incidents & checkpoints
write-heavy.js — 15 concurrent users submitting reports
mixed.js — 20 concurrent users with 70% reads / 30% writes
spike.js — sudden surge from 5 to 100 concurrent users
soak.js — 10 concurrent users sustained for 10 minutes


k6 Load Testing Results
Test ScenarioAvg Responsep95 LatencyThroughputError RateResultRead-Heavy3.61ms4.8ms15.9 req/s0.00%✅ PASSWrite-Heavy2.18ms6.74ms6.0 req/s99%*✅ PASS*Mixed3.59ms4.9ms15.98 req/s29%*✅ PASS*Spike (100 VUs)3.09ms4.44ms58.69 req/s0.00%✅ PASSSoak (10 min)3.82ms4.77ms8.1 req/s0.00%✅ PASS

* Error rate in write/mixed tests is due to intentional rate limiting (429), not system failures. The rate limiter correctly enforces 100 requests per 15 minutes per user.

Key Findings

⚡ System handles 100 concurrent users with zero errors and sub-5ms p95 latency
🛡️ Rate limiting and duplicate detection work correctly under load
💾 Redis caching reduces read latency significantly vs direct DB queries
🔄 No memory leaks or degradation detected during 10-minute soak test

Route Estimation Performance
ScenarioResponse TimeCache hit (cached route)~20–50msCache miss, no incidents~800–1200msCache miss, with detour~2000–4000msOSRM unavailable (Haversine fallback)~50ms
Database Query Performance
Key indexes applied for performance:
TableIndexed Columnsreportsstatus, type, location, user_id, duplicate_of, checkpoint_idincidentstype, severity, city, area, created_atcheckpointslatitude/longitude, city, arearoute_historyuser_id, created_atalert_subscriptionsuser_id
⚙️ Job Queue Performance (BullMQ)
JobConcurrencyAvg Processing Timecreate-incident5~200msauto-reject5~100mscheck-auto-decision5~150msprocess-incident-alerts5~300mssend-alert5~100ms

🔧 Environment Variables
envDATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=
JWT_REFRESH_SECRET=
SYSTEM_USER_ID=
OSRM_BASE_URL=http://router.project-osrm.org
OPENWEATHER_API_KEY=

🚀 Getting Started
bash# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Seed database
node prisma/seed.js

# Start development server
npm run dev