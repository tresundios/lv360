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

**Key insight:** The deploy server **never touches GitHub**. It only pulls Docker images from Docker Hub and runs them using `docker compose`.

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
        ├── Stage 2: Run tests (on Jenkins server)
        ├── Stage 3: Docker build (on Jenkins server)
        ├── Stage 4: Docker push → Docker Hub (navistresundios/lamviec360-*)
        ├── Stage 5: SSH into deploy server (103.175.146.37)
        │            └── docker pull new image
        │            └── docker compose up (restart service)
        │            └── health check
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

**NO.** You do NOT need to clone the full GitHub repo on the deploy server.

The deploy server only needs **3 things**:

```
/opt/lamviec360/
├── docker-compose.dev.yml      ← tells Docker which images to run
├── env/
│   └── .env.dev                ← environment variables (passwords, URLs, etc.)
└── backend/
    └── scripts/
        └── backup.sh           ← (optional) for pg-backup service
```

These files are **copied once** during initial setup (see Section 6). After that, Jenkins SSHes in and runs `docker pull` + `docker compose up` — no git needed.

### Why not clone?

- The deploy server doesn't compile or build anything
- Docker images are pre-built on Jenkins and stored in Docker Hub
- Fewer dependencies = more secure deploy server
- No need for git, node, python, etc. on the deploy server

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

### 6.3 Create project directory and required files

```bash
# Create directory
mkdir -p /opt/lamviec360/env
mkdir -p /opt/lamviec360/backend/scripts
chown -R deploy:deploy /opt/lamviec360
```

### 6.4 Copy the 3 required files

From your **local machine** (Mac), copy the files to the deploy server:

```bash
# From your Mac, in the project root
scp docker-compose.dev.yml root@103.175.146.37:/opt/lamviec360/
scp env/.env.dev root@103.175.146.37:/opt/lamviec360/env/
```

Or create them manually on the server. The critical file is `docker-compose.dev.yml` which references the Docker Hub images:

```yaml
# Key lines in docker-compose.dev.yml:
services:
  fastapi:
    image: docker.io/navistresundios/lamviec360-backend:${DOCKER_IMAGE_TAG:-dev-latest}
  react:
    image: docker.io/navistresundios/lamviec360-frontend:${DOCKER_IMAGE_TAG:-dev-latest}
```

### 6.5 Edit env/.env.dev with REAL passwords

```bash
su - deploy
nano /opt/lamviec360/env/.env.dev
```

**Change these values** (do NOT use the defaults in production/dev):
- `POSTGRES_PASSWORD` → a strong random password
- `JWT_SECRET` → a strong random string
- `DOCKER_IMAGE_TAG` → leave as `dev-latest` initially

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
