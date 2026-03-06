# LamViec360 — Deployment Plan & Playbook

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How the CI/CD Flow Works](#2-how-the-cicd-flow-works)
3. [Do I Need to Clone the Repo on the Deploy Server?](#3-do-i-need-to-clone-the-repo-on-the-deploy-server)
4. [Server Inventory](#4-server-inventory)
5. [One-Time Setup: Jenkins Server (103.175.146.36)](#5-one-time-setup-jenkins-server)
6. [One-Time Setup: Deploy Server (103.175.146.37)](#6-one-time-setup-deploy-server)
7. [One-Time Setup: Jenkins UI Configuration](#7-one-time-setup-jenkins-ui-configuration)
8. [One-Time Setup: GitHub Webhook](#8-one-time-setup-github-webhook)
9. [Day-to-Day Developer Workflow](#9-day-to-day-developer-workflow)
10. [Manual Deployment (First Time / Emergency)](#10-manual-deployment)
11. [Rollback Procedure](#11-rollback-procedure)
12. [Troubleshooting](#12-troubleshooting)
13. [Checklist](#13-checklist)
14. [CI/CD Pipeline Fixes Reference](#14-cicd-pipeline-fixes-reference)

---

## 1. Architecture Overview

```
┌──────────────┐       webhook        ┌──────────────────────────────┐
│   GitHub     │ ───────────────────> │  Jenkins Server              │
│   (lv360)    │                      │  103.175.146.36              │
│              │ <─── checkout ────── │  jenkins.lamviec360.com      │
└──────────────┘                      │                              │
                                      │  1. Checkout code            │
                                      │  2. Run tests                │
                                      │  3. docker build             │
                                      │  4. docker push to Hub       │
                                      │  5. SSH to deploy server     │
                                      └──────────┬───────────────────┘
                                                  │ SSH + docker commands
                                                  ▼
┌──────────────┐                      ┌──────────────────────────────┐
│  Docker Hub  │ <── push/pull ─────> │  Deploy Server               │
│  navistres-  │                      │  103.175.146.37              │
│  undios/     │                      │                              │
│  lamviec360  │                      │  dev.lamviec360.com  :8000   │
│  -backend    │                      │  appdev.lamviec360.com :80   │
│  -frontend   │                      │                              │
└──────────────┘                      │  Runs:                       │
                                      │   - FastAPI (Docker)         │
                                      │   - React/Nginx (Docker)     │
                                      │   - PostgreSQL (Docker)      │
                                      │   - Redis (Docker)           │
                                      └──────────────────────────────┘
```

**Key insight:** The deploy server pulls Docker images from Docker Hub and runs them using `docker compose`. It also runs `git pull` to keep compose files and configs in sync with the repo.

---

## 2. How the CI/CD Flow Works

### Trigger → Build → Push → Deploy

```
Developer pushes to `dev` branch on GitHub
        │
        ▼
GitHub sends webhook to Jenkins (jenkins.lamviec360.com/github-webhook/)
        │
        ▼
Jenkins pipeline starts (Jenkinsfile.backend or Jenkinsfile.frontend)
        │
        ├── Stage 1: Checkout code FROM GITHUB (on Jenkins server)
        ├── Stage 2: Run tests in isolated Docker container (on Jenkins server)
        │            └── Uses named container + docker cp to extract JUnit report
        ├── Stage 3: Docker build (on Jenkins server)
        ├── Stage 4: Docker push → Docker Hub (navistresundios/lamviec360-*)
        ├── Stage 5: SSH into deploy server (103.175.146.37)
        │            └── git pull (sync compose files & configs)
        │            └── docker pull new image
        │            └── source env file (export vars for Compose)
        │            └── docker compose down + kill rogue containers
        │            └── docker compose up (postgres, redis, fastapi, pg-backup)
        ├── Stage 6: Run Alembic migrations via SSH
        ├── Stage 7: Health check
        └── Done ✅
```

### What happens WHERE:

| Action | Where it happens |
|--------|-----------------|
| Code checkout from GitHub | Jenkins server (103.175.146.36) |
| Run pytest / npm test | Jenkins server |
| `docker build` | Jenkins server |
| `docker push` to Docker Hub | Jenkins server → Docker Hub |
| `docker pull` from Docker Hub | Deploy server (103.175.146.37) |
| `docker compose up` | Deploy server |
| App is running and serving traffic | Deploy server |

---

## 3. Do I Need to Clone the Repo on the Deploy Server?

**YES — a shallow clone is required.** The deploy server needs the repo so that Jenkins can `git pull` to keep compose files, scripts, and configs in sync.

```
/opt/lamviec360/                ← git clone of the repo
├── docker-compose.dev.yml      ← tells Docker which images to run
├── env/
│   └── .env.dev                ← environment variables (passwords, URLs, etc.) — gitignored
└── backend/
    └── scripts/
        └── backup.sh           ← mounted into pg-backup container
```

The Jenkins deploy stage runs `git pull origin dev` on the deploy server before every deployment. This ensures compose files, backup scripts, and other configs are always up to date.

### Why clone?

- Compose files (`docker-compose.dev.yml`) and scripts (`backup.sh`) may change between deploys
- Without `git pull`, the deploy server would run stale configs even after code changes
- The `env/` directory is **gitignored** — secrets are safe and must be configured manually once (see Section 6.5)
- The deploy server still doesn't compile or build anything — Docker images are pre-built on Jenkins

---

## 4. Server Inventory

| Server | IP | Domain | Role |
|--------|----|--------|------|
| Jenkins | 103.175.146.36 | jenkins.lamviec360.com | CI/CD — builds, tests, pushes images |
| Dev Deploy | 103.175.146.37 | dev.lamviec360.com (backend), appdev.lamviec360.com (frontend) | Runs the application |

### DNS Records Required

| Type | Name | Value |
|------|------|-------|
| A | jenkins.lamviec360.com | 103.175.146.36 |
| A | dev.lamviec360.com | 103.175.146.37 |
| A | appdev.lamviec360.com | 103.175.146.37 |

---

## 5. One-Time Setup: Jenkins Server (103.175.146.36)

SSH into the Jenkins server:

```bash
ssh root@103.175.146.36
```

### 5.1 Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker jenkins
systemctl restart jenkins
```

### 5.2 Generate SSH deploy key

```bash
ssh-keygen -t ed25519 -f /tmp/jenkins-deploy-key -N "" -C "jenkins@lamviec360"

# Save the private key content — you'll paste it into Jenkins UI later
cat /tmp/jenkins-deploy-key

# Save the public key content — you'll paste it on the deploy server
cat /tmp/jenkins-deploy-key.pub
```

### 5.3 Test connectivity to deploy server

```bash
# This should work AFTER step 6.2
ssh -i /tmp/jenkins-deploy-key -o StrictHostKeyChecking=no deploy@103.175.146.37 "echo connected"
```

---

## 6. One-Time Setup: Deploy Server (103.175.146.37)

SSH into the deploy server:

```bash
ssh root@103.175.146.37
```

### 6.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 6.2 Create deploy user

```bash
# Create user
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Add Jenkins public key so Jenkins can SSH in
mkdir -p /home/deploy/.ssh
echo "PASTE_THE_PUBLIC_KEY_FROM_STEP_5.2_HERE" >> /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### 6.3 Clone the repository

```bash
# Install git if not present
apt install -y git

# Clone the repo
su - deploy
git clone https://github.com/tresundios/lv360.git /opt/lamviec360
cd /opt/lamviec360
git checkout dev
```

### 6.4 Create the env file

The `env/` directory is gitignored, so you need to create it manually:

```bash
mkdir -p /opt/lamviec360/env
```

From your **local machine** (Mac), copy the env file to the deploy server:

```bash
# From your Mac, in the project root
scp env/.env.dev deploy@103.175.146.37:/opt/lamviec360/env/
```

Or create it manually on the server using `env/.env.example` as a template.

### 6.5 Edit env/.env.dev with REAL passwords

```bash
su - deploy
nano /opt/lamviec360/env/.env.dev
```

**Change these values** (do NOT use the defaults in production/dev):
- `POSTGRES_PASSWORD` → a strong random password (**must be URL-safe**, no `@`, `!`, `#` characters)
- `JWT_SECRET` → a strong random string
- `DOCKER_IMAGE_TAG` → leave as `dev-latest` initially
- `DATABASE_URL` → must use the **same password** as `POSTGRES_PASSWORD`

Generate secure values:

```bash
# Generate URL-safe password and JWT secret
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(20))"
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(32))"
```

> **Important:** The `POSTGRES_PASSWORD` in `DATABASE_URL` must match exactly. If the password contains special characters like `@`, it will break the URL parsing in SQLAlchemy.

### 6.6 Set up Nginx reverse proxy

Install Nginx to route domain names to Docker ports:

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/lamviec360-dev`:

```nginx
# Backend API — dev.lamviec360.com → localhost:8000
server {
    listen 80;
    server_name dev.lamviec360.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend — appdev.lamviec360.com → localhost:80 (Docker)
server {
    listen 80;
    server_name appdev.lamviec360.com;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Note:** The frontend Docker container maps to port 80 inside Docker, but since Nginx on the host already uses port 80, you need to change the frontend port mapping in `docker-compose.dev.yml` from `"80:80"` to `"3080:80"`.

Enable and get SSL:

```bash
ln -s /etc/nginx/sites-available/lamviec360-dev /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificates
certbot --nginx -d dev.lamviec360.com -d appdev.lamviec360.com
```

### 6.7 Update docker-compose.dev.yml port for frontend

On the deploy server, edit the frontend port to avoid conflict with Nginx:

```bash
nano /opt/lamviec360/docker-compose.dev.yml
```

Change the react service ports:
```yaml
  react:
    ports:
      - "3080:80"    # Changed from "80:80" to avoid conflict with host Nginx
```

### 6.8 Login to Docker Hub (one time)

```bash
su - deploy
docker login -u navistresundios
# Enter your Docker Hub password/token
```

---

## 7. One-Time Setup: Jenkins UI Configuration

Go to **https://jenkins.lamviec360.com**

### 7.1 Install Required Plugins

**Manage Jenkins** → **Manage Plugins** → **Available** → Install:

- Pipeline
- Git
- GitHub Integration Plugin
- SSH Agent Plugin
- Docker Pipeline
- Timestamps

Restart Jenkins after installation.

### 7.2 Add Credentials

**Manage Jenkins** → **Credentials** → **(global)** → **Add Credentials**

#### Credential 1: Docker Hub

| Field | Value |
|-------|-------|
| Kind | Username with password |
| ID | `dockerhub-credentials` |
| Username | `navistresundios` |
| Password | Docker Hub access token (generate at https://hub.docker.com/settings/security) |

#### Credential 2: SSH Key for Dev Server

| Field | Value |
|-------|-------|
| Kind | SSH Username with private key |
| ID | `ssh-dev-server` |
| Username | `deploy` |
| Private Key | Enter directly → paste contents of `/tmp/jenkins-deploy-key` from step 5.2 |

#### Credential 3: GitHub SSH Key (for checkout)

| Field | Value |
|-------|-------|
| Kind | SSH Username with private key |
| ID | `github-ssh` |
| Username | `git` |
| Private Key | Enter directly → paste the private key that has access to `github.com/tresundios/lv360` |

### 7.3 Create Backend Pipeline

1. **Dashboard** → **New Item**
2. **Name:** `lv360-backend`
3. **Type:** Pipeline → **OK**
4. Configure:
   - **General** → Check **GitHub project** → URL: `https://github.com/tresundios/lv360`
   - **Build Triggers** → Check **GitHub hook trigger for GITScm polling**
   - **Pipeline:**
     - Definition: **Pipeline script from SCM**
     - SCM: **Git**
     - Repository URL: `git@github.com:tresundios/lv360.git`
     - Credentials: `github-ssh`
     - Branch: `*/dev`
     - Script Path: `jenkins/Jenkinsfile.backend`
5. **Save**

### 7.4 Create Frontend Pipeline

Same as 7.3 but:
- **Name:** `lv360-frontend`
- **Script Path:** `jenkins/Jenkinsfile.frontend`

---

## 8. One-Time Setup: GitHub Webhook

1. Go to **https://github.com/tresundios/lv360/settings/hooks**
2. **Add webhook:**

| Field | Value |
|-------|-------|
| Payload URL | `https://jenkins.lamviec360.com/github-webhook/` |
| Content type | `application/json` |
| Which events | Just the push event |
| Active | ✅ |

3. **Save** → GitHub will send a test ping

---

## 9. Day-to-Day Developer Workflow

This is what you do **every day** after initial setup:

```
1. Create a feature branch from dev
   $ git checkout dev
   $ git pull
   $ git checkout -b feature/LV-XXX-my-feature

2. Write code, commit, push
   $ git add .
   $ git commit -m "feat: add new feature"
   $ git push -u origin feature/LV-XXX-my-feature

3. Create a Pull Request on GitHub: feature/LV-XXX → dev

4. After PR review, merge to dev

5. GitHub webhook fires → Jenkins automatically:
   ├── Checks out dev branch
   ├── Runs tests
   ├── Builds Docker image
   ├── Pushes to Docker Hub (navistresundios/lamviec360-backend:dev-XX)
   ├── SSHes into 103.175.146.37
   ├── Pulls the new image
   ├── Restarts the service
   └── Verifies health check

6. Visit https://dev.lamviec360.com to see your changes live ✅
```

**You never SSH into the deploy server for deployments.** Jenkins does it all.

---

## 10. Manual Deployment (First Time / Emergency)

### First-time bootstrap (before Jenkins runs)

On the deploy server as `deploy` user:

```bash
cd /opt/lamviec360

# Pull images manually
docker pull navistresundios/lamviec360-backend:dev-latest
docker pull navistresundios/lamviec360-frontend:dev-latest

# Start everything
docker compose -f docker-compose.dev.yml up -d

# Check status
docker compose -f docker-compose.dev.yml ps

# Check logs
docker compose -f docker-compose.dev.yml logs -f fastapi
docker compose -f docker-compose.dev.yml logs -f react
```

### Manual Jenkins trigger

1. Go to **https://jenkins.lamviec360.com**
2. Click `lv360-backend` → **Build with Parameters**
3. TARGET_ENV: `dev` → **Build**

---

## 11. Rollback Procedure

Every build creates an **immutable tag** like `dev-42`. To rollback:

```bash
# SSH into deploy server
ssh deploy@103.175.146.37
cd /opt/lamviec360

# Check current running tag
docker compose -f docker-compose.dev.yml ps

# Rollback to a specific build number (e.g., build 41)
sed -i 's|DOCKER_IMAGE_TAG=.*|DOCKER_IMAGE_TAG=dev-41|' env/.env.dev
docker compose -f docker-compose.dev.yml pull
docker compose -f docker-compose.dev.yml up -d

# Verify
curl -f http://localhost:8000/health
```

---

## 12. Troubleshooting

### Jenkins can't SSH into deploy server

```bash
# From Jenkins server, test SSH
ssh -v -i /tmp/jenkins-deploy-key deploy@103.175.146.37 "echo ok"
```

- **Connection timed out** → Firewall blocking port 22. Open it:
  ```bash
  # On deploy server
  sudo ufw allow from 103.175.146.36 to any port 22
  ```
- **Permission denied** → Public key not in `authorized_keys`. Re-add it (see step 6.2)

### Docker pull fails

```bash
# On deploy server as deploy user
docker login -u navistresundios
docker pull navistresundios/lamviec360-backend:dev-latest
```

- **Unauthorized** → Re-login to Docker Hub
- **Not found** → Jenkins hasn't pushed the image yet. Run the Jenkins job first

### App not accessible via domain

```bash
# On deploy server, check if containers are running
docker compose -f docker-compose.dev.yml ps

# Check if Nginx is running
sudo systemctl status nginx

# Check Nginx config
sudo nginx -t

# Check SSL
sudo certbot certificates
```

### Database migration failed

```bash
# On deploy server
cd /opt/lamviec360
docker compose -f docker-compose.dev.yml exec fastapi alembic upgrade head
docker compose -f docker-compose.dev.yml logs fastapi
```

### POSTGRES_PASSWORD warning: "variable is not set"

This means Docker Compose cannot resolve `${POSTGRES_PASSWORD}` during interpolation.

**Root cause:** `${VAR}` in the `environment:` block of a compose file is resolved by Compose from the **shell environment**, NOT from `env_file`. The `env_file` directive only injects variables into the container at runtime.

**Fix:** Either:
1. Remove `${POSTGRES_PASSWORD}` from the `environment:` block and let `env_file` handle it (preferred)
2. Export the variable to the shell before running compose: `set -a; source env/.env.dev; set +a`

The Jenkinsfile deploy stage already does option 2 for `DOCKER_IMAGE_TAG`.

### Port already allocated (5432, 8000, 6379)

This means a Docker container from a previous run is still bound to the port.

```bash
# Find and kill the container using port 5432
docker ps -q --filter "publish=5432" | xargs -r docker rm -f

# Or kill all containers on common ports
for PORT in 5432 8000 6379; do
    docker rm -f $(docker ps -q --filter "publish=${PORT}") 2>/dev/null || true
done
```

The Jenkinsfile deploy stage handles this automatically.

### Postgres container unhealthy after deploy

Usually caused by the Postgres data volume being initialized with a wrong/blank password.

```bash
# On deploy server — wipe and reinitialize
cd /opt/lamviec360
docker compose -f docker-compose.dev.yml down
docker volume rm lv360_pgdata_dev

# Verify env file has POSTGRES_PASSWORD set
grep POSTGRES_PASSWORD env/.env.dev

# Restart
set -a; source env/.env.dev; set +a
docker compose -f docker-compose.dev.yml up -d postgres redis
docker compose -f docker-compose.dev.yml logs -f postgres
```

> **Warning:** This deletes all database data. Only do this if the DB is corrupted or freshly set up. For existing environments, investigate the root cause first.

### Tests fail with "could not translate host name postgres"

The test container runs in isolation without a Postgres service. Tests must mock all DB connections.

**Fix in `tests/test_hello.py`:**
- Use `app.dependency_overrides[get_db]` instead of `@patch("app.database.get_db")`
- Patch lifespan functions: `wait_for_db`, `Base`, `seed_hello_world`

### JUnit report not found in Jenkins

The test container writes `/tmp/results.xml` inside the container. If using `--rm`, the file is lost.

**Fix:** Use a named container, then `docker cp` the file out:
```bash
docker run --name test-runner-${BUILD_NUMBER} ...
docker cp test-runner-${BUILD_NUMBER}:/tmp/results.xml ./results.xml
docker rm test-runner-${BUILD_NUMBER}
```

### Deploy server has stale compose files

If changes to `docker-compose.dev.yml` aren't taking effect on the deploy server:

```bash
# On deploy server
cd /opt/lamviec360
git pull origin dev
```

The Jenkinsfile deploy stage runs `git pull` automatically. If this still fails, manually SCP the file:

```bash
# From local machine
scp docker-compose.dev.yml deploy@103.175.146.37:/opt/lamviec360/
```

---

## 13. Checklist

### Jenkins Server (103.175.146.36)

- [ ] Docker installed
- [ ] Jenkins installed and running
- [ ] SSH deploy key generated
- [ ] Jenkins can SSH to deploy server (`ssh deploy@103.175.146.37`)
- [ ] Jenkins plugins installed (Pipeline, Git, GitHub Integration, SSH Agent, Docker Pipeline)
- [ ] Credential: `dockerhub-credentials` (Docker Hub login)
- [ ] Credential: `ssh-dev-server` (SSH private key for deploy server)
- [ ] Credential: `github-ssh` (SSH key for GitHub checkout)
- [ ] Pipeline: `lv360-backend` created (Script Path: `jenkins/Jenkinsfile.backend`)
- [ ] Pipeline: `lv360-frontend` created (Script Path: `jenkins/Jenkinsfile.frontend`)

### Deploy Server (103.175.146.37)

- [ ] Docker installed
- [ ] `deploy` user created and added to `docker` group
- [ ] Jenkins public key in `/home/deploy/.ssh/authorized_keys`
- [ ] `/opt/lamviec360/` directory created, owned by `deploy`
- [ ] `docker-compose.dev.yml` present in `/opt/lamviec360/`
- [ ] `env/.env.dev` present with REAL passwords (not defaults)
- [ ] Frontend port changed to `3080:80` (avoid Nginx conflict)
- [ ] Docker Hub login done (`docker login`)
- [ ] Nginx installed with reverse proxy config
- [ ] SSL certificates obtained via certbot

### GitHub

- [ ] Webhook configured: `https://jenkins.lamviec360.com/github-webhook/`
- [ ] Deploy key added (if repo is private)

### DNS

- [ ] `jenkins.lamviec360.com` → `103.175.146.36`
- [ ] `dev.lamviec360.com` → `103.175.146.37`
- [ ] `appdev.lamviec360.com` → `103.175.146.37`

### First Deployment Verification

- [ ] Jenkins backend pipeline runs successfully
- [ ] Jenkins frontend pipeline runs successfully
- [ ] `https://dev.lamviec360.com/health` returns OK
- [ ] `https://dev.lamviec360.com/docs` shows FastAPI docs
- [ ] `https://appdev.lamviec360.com` loads the React app
- [ ] pg-backup container is running (`docker ps | grep pgbackup`)
- [ ] Postgres data persists across redeploys

---

## 14. CI/CD Pipeline Fixes Reference

This section documents all the pipeline issues encountered and their fixes. Use it as a reference when debugging future failures.

### 14.1 Test Stage Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Tests hang forever | Entrypoint script (`entrypoint.sh`) waits for DB connection | Override entrypoint: `docker run --entrypoint ""` |
| `tests/ directory not found` | Tests not included in Docker image | Added `COPY ./tests ./tests` to `Dockerfile.prod` |
| `could not translate host name "postgres"` | Tests tried to connect to real DB via lifespan functions | Used `app.dependency_overrides[get_db]` + patched `wait_for_db`, `Base`, `seed_hello_world` in test fixtures |
| JUnit report not found | `--rm` flag deletes container before report can be read | Use named container + `docker cp` to extract `results.xml` |

### 14.2 Deploy Stage Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `Bind for 0.0.0.0:8000 failed` | Previous containers still running on the port | Added `docker compose down --remove-orphans` before starting services |
| `Bind for 0.0.0.0:5432 failed` | Rogue containers from previous deploys/other projects | Added loop to kill containers on ports 5432, 8000, 6379 before `compose up` |
| `frontend:dev-latest not found` | `docker compose up -d` tries to pull ALL services including frontend | Start only needed services: `docker compose up -d postgres redis fastapi pg-backup` |
| `POSTGRES_PASSWORD is not set` | `${POSTGRES_PASSWORD}` in compose `environment:` block reads from shell, not `env_file` | Removed Compose interpolation from postgres service; added `set -a; source env/.env.dev; set +a` in deploy script |
| Postgres container unhealthy | Data volume initialized with blank password | Wiped volume (`docker volume rm lv360_pgdata_dev`) and redeployed |
| Stale compose files on server | Jenkinsfile only pulled Docker image, never updated configs | Added `git pull origin ${TARGET_ENV}` in deploy stage |
| pg-backup not running | Service not included in `docker compose up` command | Added `pg-backup` to the deploy command |
| `PGPASSWORD` missing for pg-backup | Removed during Compose interpolation cleanup | Restored `PGPASSWORD: ${POSTGRES_PASSWORD}` (works because `source env/.env.dev` exports it) |

### 14.3 Environment & Config Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `POSTGRES_PASSWORD` warning persists | `env_file` only passes vars into container; Compose `${VAR}` reads from shell | For postgres service: removed `${POSTGRES_PASSWORD}` from `environment:` block (use `env_file` only). For pg-backup: kept `${POSTGRES_PASSWORD}` but deploy script sources env file first |
| Password breaks `DATABASE_URL` | Special characters (`@`, `!`) in password break URL parsing | Use URL-safe passwords only (generated via `secrets.token_urlsafe()`) |
| Changes not deployed | Code pushed to feature branch, not merged to `dev` | Always merge to `dev` before expecting Jenkins to pick up changes |

### 14.4 How Docker Compose Environment Variables Work

This is the key concept that caused the most issues:

```yaml
services:
  postgres:
    env_file:
      - ./env/.env.dev          # (A) Injects vars INTO the container at runtime
    environment:
      POSTGRES_PASSWORD: ${VAR}  # (B) Compose resolves ${VAR} from SHELL before container starts
```

- **(A) `env_file`** — Variables are passed into the container's environment. The container can read them. Compose itself does NOT see them.
- **(B) `environment` with `${VAR}`** — Compose resolves `${VAR}` from the **host shell environment** or a `.env` file in the project root. If the variable isn't exported in the shell, Compose shows a warning.

**Our solution:**
- For the `postgres` service: removed `${POSTGRES_PASSWORD}` from `environment:` — `env_file` provides it directly to the container
- For `pg-backup`: kept `PGPASSWORD: ${POSTGRES_PASSWORD}` because `pg_dump` needs `PGPASSWORD` (different var name), and the deploy script runs `set -a; source env/.env.dev; set +a` to export all vars to the shell first
- For `DOCKER_IMAGE_TAG`: kept `${DOCKER_IMAGE_TAG:-dev-latest}` in the image tag since the deploy script exports it via `source`

### 14.5 Database Persistence

The Postgres database is **NOT reinstalled** on every deploy:

- Data lives in Docker named volume `lv360_pgdata_dev`
- `docker compose down` removes containers but **NOT** volumes
- `docker compose up` creates new containers that mount the **existing** volume
- Postgres initialization (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) only runs on **first start** when the volume is empty
- Schema changes are handled by **Alembic migrations** (non-destructive)

**When data IS lost:**
- `docker volume rm lv360_pgdata_dev` (explicit volume deletion)
- `docker compose down -v` (the `-v` flag removes volumes)

### 14.6 Backup Service

The `pg-backup` service runs inside a `postgres:15-alpine` container:

- **Schedule:** Daily at 02:30 AM IST
- **Method:** `pg_dump` → gzip → `/data/postgres-backups-dev/` on host
- **Retention:** 30 days (auto-deletes older backups)
- **Auth:** Uses `PGPASSWORD` env var (provided via Compose interpolation)
- **Script:** `backend/scripts/backup.sh` (mounted read-only into the container)
