# LamViec 360 — Enterprise SaaS Platform

> Full-stack application: FastAPI + React + PostgreSQL + Redis  
> CI/CD: Jenkins → Docker Hub → Multi-environment deployment

---

## Directory Structure

```
lv360/
├── docker-compose.local.yml        # Local development stack
├── docker-compose.dev.yml           # Dev server deployment
├── docker-compose.qa.yml            # QA environment
├── docker-compose.uat.yml           # UAT environment
├── docker-compose.prod.yml          # Production deployment
├── Makefile                         # Developer commands
├── .gitignore                       # Root gitignore
├── README.md                        # This file
│
├── env/                             # Environment configs
│   ├── .env.example                 # Template (committed)
│   ├── .env.local                   # Local dev (gitignored)
│   ├── .env.dev                     # Dev server (gitignored)
│   ├── .env.qa                      # QA (gitignored)
│   ├── .env.uat                     # UAT (gitignored)
│   └── .env.prod                    # Production (gitignored)
│
├── scripts/                         # Shared scripts
│   └── init-db.sql                  # DB seed for local/dev
│
├── jenkins/                         # CI/CD pipeline definitions
│   ├── Jenkinsfile.backend          # FastAPI pipeline
│   └── Jenkinsfile.frontend         # React pipeline
│
├── backend/                         # FastAPI Backend
│   ├── Dockerfile                   # Dev Dockerfile (hot-reload)
│   ├── Dockerfile.prod              # Production multi-stage build
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── alembic.ini                  # Alembic config
│   ├── alembic/
│   │   ├── env.py                   # Migration environment
│   │   ├── script.py.mako           # Migration template
│   │   └── versions/               # Migration files
│   │       └── 2026_03_02_001_initial_schema.py
│   ├── scripts/
│   │   ├── entrypoint.sh            # Production entrypoint
│   │   └── backup.sh                # DB backup (existing)
│   └── app/
│       ├── __init__.py
│       ├── main.py                  # FastAPI app + lifespan
│       ├── config.py                # pydantic-settings config
│       ├── database.py              # SQLAlchemy engine + session
│       ├── redis_client.py          # Redis connection
│       ├── models.py                # ORM models (Task, HelloWorld)
│       ├── schemas.py               # Pydantic schemas
│       ├── crud.py                  # CRUD operations
│       └── routers/
│           ├── __init__.py
│           └── hello.py             # /api/hello-db, /api/hello-cache
│
└── frontend/                        # React Frontend (Vite)
    ├── Dockerfile                   # Existing build-to-static
    ├── Dockerfile.dev               # Dev Dockerfile (hot-reload)
    ├── Dockerfile.prod              # Production multi-stage (nginx)
    ├── .dockerignore
    ├── nginx/
    │   └── default.conf             # nginx config with API proxy
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx                  # Routes (includes /hello-db, /hello-cache)
        ├── main.tsx
        ├── pages/
        │   ├── home.tsx
        │   ├── about.tsx
        │   ├── demo.tsx
        │   ├── hello-db.tsx         # DB → Backend → Frontend flow
        │   └── hello-cache.tsx      # DB → Redis → Backend → Frontend flow
        ├── lib/
        │   └── axios.ts             # Axios instance with VITE_API_URL
        ├── components/
        ├── providers/
        └── store/
```

---

## Quick Start — Local Development

```bash
# 1. Clone and enter the repo
git clone <repo-url> lv360 && cd lv360

# 2. Start everything
make local-up

# 3. Verify
#   Backend:  http://localhost:8000/docs
#   Frontend: http://localhost:3000
#   Hello DB: http://localhost:8000/api/hello-db
#   Hello Cache: http://localhost:8000/api/hello-cache
#   Health:   http://localhost:8000/health

# 4. Tail logs
make logs

# 5. Stop
make local-down

# 6. Full rebuild (no cache)
make rebuild

# 7. Reset database
make db-reset
```

---

## Makefile Commands

| Command            | Description                          |
|--------------------|--------------------------------------|
| `make local-up`    | Build and start all local services   |
| `make local-down`  | Stop all local services              |
| `make rebuild`     | Rebuild from scratch (no cache)      |
| `make logs`        | Tail all service logs                |
| `make logs-api`    | Tail FastAPI logs only               |
| `make logs-fe`     | Tail React logs only                 |
| `make db-shell`    | Open psql shell                      |
| `make db-reset`    | Destroy and recreate database        |
| `make migrate`     | Run Alembic migrations               |
| `make migrate-gen` | Auto-generate a new migration        |
| `make redis-shell` | Open redis-cli                       |
| `make test-api`    | Run backend tests                    |
| `make test-fe`     | Run frontend tests                   |
| `make clean`       | Remove all containers + volumes      |

---

## Hello World Flows

### Flow A: DB → Backend → Frontend

```
PostgreSQL (hello_world table)
    → GET /api/hello-db (FastAPI)
        → React page at /hello-db
```

**Response:**
```json
{
  "source": "postgres",
  "message": "Hello World from Postgres",
  "id": 1
}
```

### Flow B: DB → Redis → Backend → Frontend

```
Request → FastAPI checks Redis cache
    ├── Cache HIT  → return from Redis
    └── Cache MISS → fetch from PostgreSQL → store in Redis → return
        → React page at /hello-cache
```

**First request (cache miss):**
```json
{
  "source": "postgres",
  "cached": false,
  "message": "Hello World from Postgres",
  "id": 1
}
```

**Subsequent requests (cache hit, TTL 5 min):**
```json
{
  "source": "redis",
  "cached": true,
  "message": "Hello World from Postgres",
  "id": 1
}
```

---

## Database Lifecycle Strategy

| Environment | Strategy | Details |
|-------------|----------|---------|
| **Local** | Docker named volume (`lv360_pgdata`) | Destroyed with `make db-reset`. Seed via `init-db.sql` on first run. |
| **Dev** | Persistent Docker volume (`lv360_pgdata_dev`) | Survives container restarts. Backed up via `pg-backup` sidecar. |
| **QA** | Separate DB per environment | Isolated `lamviec360_qa` database. Can be reset between test cycles. |
| **UAT** | Separate DB per environment | Isolated `lamviec360_uat` database. Mirrors production schema. |
| **Prod** | Managed PostgreSQL (future) | AWS RDS / GCP Cloud SQL. Connection via `DATABASE_URL` env injection. |

### Migration Workflow (Alembic)

```bash
# Generate a new migration after model changes
make migrate-gen MSG="add users table"

# Apply pending migrations
make migrate

# View migration history
make migrate-history
```

**CI/CD auto-migration:** The `entrypoint.sh` script runs `alembic upgrade head` before starting the FastAPI server in non-local environments.

---

## CI/CD Pipeline — Jenkins

### Pipeline Architecture

```
Developer → PR merge to dev → GitHub webhook → Jenkins
    ├── Pipeline 1: Jenkinsfile.backend (FastAPI)
    └── Pipeline 2: Jenkinsfile.frontend (React)

Each pipeline:
    checkout → test → docker build → docker push → ssh deploy
```

### Image Tagging Strategy

```
lamviec360-backend:dev-42          # env-BUILD_NUMBER (immutable)
lamviec360-backend:dev-latest      # env-latest (rolling)

lamviec360-frontend:dev-42
lamviec360-frontend:dev-latest
```

### Jenkins Credentials Required

| Credential ID | Type | Purpose |
|---------------|------|---------|
| `dockerhub-credentials` | Username/Password | Docker Hub push |
| `ssh-dev-server` | SSH Key | Deploy to dev server |
| `ssh-qa-server` | SSH Key | Deploy to QA |
| `ssh-uat-server` | SSH Key | Deploy to UAT |
| `ssh-prod-server` | SSH Key | Deploy to production |

---

## Git Branching Strategy

```
main                    ← Production releases
├── dev                 ← Integration branch (CI/CD triggers here)
│   ├── feature/LV-101-user-auth
│   ├── feature/LV-102-dashboard
│   └── feature/LV-103-notifications
```

### Setup

```bash
git init
git add .
git commit -m "initial: enterprise architecture setup"
git branch dev
git checkout dev
# Feature branches: git checkout -b feature/LV-XXX-description
```

---

## Environment Configuration

All services read from `env/.env.<environment>`. Key variables:

| Variable | Backend | Frontend | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_SECRET` | ✅ | — | Token signing secret |
| `ENVIRONMENT` | ✅ | — | Runtime environment name |
| `CORS_ORIGINS` | ✅ | — | Allowed CORS origins |
| `VITE_API_URL` | — | ✅ | Backend API base URL |
| `VITE_ENVIRONMENT` | — | ✅ | Frontend environment label |
| `DOCKER_IMAGE_TAG` | ✅ | ✅ | Image tag for compose pull |

> **Security:** All `.env.*` files (except `.env.example`) are gitignored. Production secrets are injected via Jenkins credentials or a secrets manager.

---

## Future: Kubernetes Migration Path

This architecture is designed to migrate to K8s with minimal changes:

- **Dockerfiles** → Used as-is in K8s pod specs
- **env files** → Convert to K8s ConfigMaps + Secrets
- **docker-compose services** → Map to K8s Deployments + Services
- **nginx config** → Move to Ingress controller
- **health checks** → Map to K8s liveness/readiness probes
- **Alembic** → Run as K8s Job before deployment
- **Resource limits** → Already defined in compose `deploy` section

---

## Ports

| Service    | Local  | Dev/QA/UAT | Prod |
|------------|--------|------------|------|
| FastAPI    | 8000   | 8000       | 8000 |
| React      | 3000   | 80         | 80/443 |
| PostgreSQL | 5432   | 5432       | Managed |
| Redis      | 6379   | Internal   | Managed |
