# LamViec360 — Jenkins Server Setup Playbook

## Table of Contents

1. [How Many Pipelines Do You Need?](#1-how-many-pipelines-do-you-need)
2. [Service-to-Pipeline Mapping](#2-service-to-pipeline-mapping)
3. [Jenkins Server CLI Setup](#3-jenkins-server-cli-setup)
4. [Required Jenkins Plugins](#4-required-jenkins-plugins)
5. [Jenkins Credentials Setup (GUI)](#5-jenkins-credentials-setup-gui)
6. [Pipeline 1: lv360-backend (GUI)](#6-pipeline-1-lv360-backend)
7. [Pipeline 2: lv360-frontend (GUI)](#7-pipeline-2-lv360-frontend)
8. [GitHub Webhook Setup](#8-github-webhook-setup)
9. [Jenkins Security Hardening](#9-jenkins-security-hardening)
10. [Verify Everything Works](#10-verify-everything-works)
11. [Jenkins Maintenance Commands](#11-jenkins-maintenance-commands)
12. [Quick Reference Card](#12-quick-reference-card)

---

## 1. How Many Pipelines Do You Need?

**Answer: 2 pipelines only.**

| Pipeline | Service(s) it deploys | Why |
|----------|----------------------|-----|
| **lv360-backend** | FastAPI + Alembic migrations | Backend code changes need rebuild + push |
| **lv360-frontend** | React/Nginx | Frontend code changes need rebuild + push |

### Why NOT separate pipelines for Postgres, Redis, PG-Backup?

| Service | Pipeline needed? | Reason |
|---------|-----------------|--------|
| **PostgreSQL** | ❌ No | Uses official `postgres:15-alpine` image from Docker Hub. No custom build needed. Managed by `docker-compose.dev.yml` on the deploy server. Starts automatically. |
| **Redis** | ❌ No | Uses official `redis:7-alpine` image. No custom build. Starts automatically with Docker Compose. |
| **PG-Backup** | ❌ No | Uses official `postgres:15-alpine` image + a `backup.sh` script mounted as a volume. No build needed. |

### How each service is managed

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.dev.yml                     │
│              (on deploy server /opt/lamviec360)               │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  ┌────────┐│
│  │  fastapi    │  │   react     │  │ postgres │  │ redis  ││
│  │  (custom)   │  │  (custom)   │  │ (stock)  │  │(stock) ││
│  │             │  │             │  │          │  │        ││
│  │ Built by    │  │ Built by    │  │ Pulled   │  │Pulled  ││
│  │ Jenkins     │  │ Jenkins     │  │ directly │  │directly││
│  │ Pipeline 1  │  │ Pipeline 2  │  │ from Hub │  │from Hub││
│  └─────────────┘  └─────────────┘  └──────────┘  └────────┘│
│                                                              │
│  ┌─────────────┐                                             │
│  │ pg-backup   │                                             │
│  │ (stock +    │                                             │
│  │  script)    │                                             │
│  │ No build    │                                             │
│  └─────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
```

**When you deploy backend:**
- Jenkins rebuilds FastAPI image → pushes to Docker Hub → restarts **only** the `fastapi` service
- Postgres, Redis, pg-backup remain running untouched

**When you deploy frontend:**
- Jenkins rebuilds React image → pushes to Docker Hub → restarts **only** the `react` service
- All other services remain running untouched

**Postgres/Redis/PG-Backup start automatically** when you first run `docker compose -f docker-compose.dev.yml up -d` on the deploy server. After that, they keep running (`restart: always`).

---

## 2. Service-to-Pipeline Mapping

### Pipeline: `lv360-backend`

| Stage | What it does | Where |
|-------|-------------|-------|
| Checkout | Clones `dev` branch from GitHub | Jenkins server |
| Test | Runs `pytest` inside Docker | Jenkins server |
| Docker Build | Builds `navistresundios/lamviec360-backend:dev-N` | Jenkins server |
| Docker Push | Pushes image to Docker Hub | Jenkins → Docker Hub |
| Run Migrations | SSHes to deploy server, runs `alembic upgrade head` | Deploy server |
| Deploy | SSHes to deploy server, `docker pull` + `docker compose up -d --no-deps --force-recreate fastapi` | Deploy server |

**Jenkinsfile:** `jenkins/Jenkinsfile.backend`

### Pipeline: `lv360-frontend`

| Stage | What it does | Where |
|-------|-------------|-------|
| Checkout | Clones `dev` branch from GitHub | Jenkins server |
| Install & Lint | Runs `npm ci`, `npm run lint`, `npm run format:check` | Jenkins server |
| Test | Runs `npm test` inside Docker | Jenkins server |
| Docker Build | Builds `navistresundios/lamviec360-frontend:dev-N` with VITE env vars | Jenkins server |
| Docker Push | Pushes image to Docker Hub | Jenkins → Docker Hub |
| Deploy | SSHes to deploy server, `docker pull` + `docker compose up -d --no-deps --force-recreate react` | Deploy server |

**Jenkinsfile:** `jenkins/Jenkinsfile.frontend`

---

## 3. Jenkins Server CLI Setup

SSH into the Jenkins server:

```bash
ssh root@103.175.146.36
```

### 3.1 Verify Jenkins is running

```bash
systemctl status jenkins
```

Expected output should show `active (running)`. If not:

```bash
systemctl enable jenkins
systemctl start jenkins
```

### 3.2 Install Docker on Jenkins server

Jenkins needs Docker to build images. If Docker is not installed:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add jenkins user to docker group so pipelines can run docker commands
usermod -aG docker jenkins

# Restart Jenkins to pick up the group change
systemctl restart jenkins

# Verify docker works as jenkins user
su -s /bin/bash jenkins -c "docker info"
```

### 3.3 Install Git on Jenkins server

```bash
apt update && apt install -y git
```

### 3.4 Generate SSH deploy key for the deploy server

```bash
# Generate a key pair (no passphrase)
ssh-keygen -t ed25519 -f /tmp/jenkins-deploy-key -N "" -C "jenkins@lamviec360"

# Display the PRIVATE key (you'll paste this into Jenkins GUI in step 5)
echo "=== PRIVATE KEY (save this for Jenkins credential ssh-dev-server) ==="
cat /tmp/jenkins-deploy-key
echo ""

# Display the PUBLIC key (you'll paste this on the deploy server)
echo "=== PUBLIC KEY (add this to deploy server authorized_keys) ==="
cat /tmp/jenkins-deploy-key.pub
echo ""
```

**Save both outputs.** You'll need them in steps 5 and the deploy server setup.

### 3.5 Add the public key to the deploy server

```bash
# Copy public key to deploy server's deploy user
ssh-copy-id -i /tmp/jenkins-deploy-key.pub deploy@103.175.146.37

# If ssh-copy-id doesn't work, do it manually:
# ssh root@103.175.146.37 "mkdir -p /home/deploy/.ssh && echo '$(cat /tmp/jenkins-deploy-key.pub)' >> /home/deploy/.ssh/authorized_keys && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh"
```

### 3.6 Test SSH connectivity

```bash
ssh -i /tmp/jenkins-deploy-key -o StrictHostKeyChecking=no deploy@103.175.146.37 "echo SUCCESS: Jenkins can reach deploy server"
```

Expected output: `SUCCESS: Jenkins can reach deploy server`

### 3.7 Set up GitHub SSH key for Jenkins

Jenkins needs to checkout code from GitHub. If GitHub repo is private:

```bash
# Generate a separate key for GitHub (or reuse an existing one)
ssh-keygen -t ed25519 -f /tmp/jenkins-github-key -N "" -C "jenkins-github@lamviec360"

# Display the key pair
echo "=== PRIVATE KEY (save this for Jenkins credential github-ssh) ==="
cat /tmp/jenkins-github-key
echo ""
echo "=== PUBLIC KEY (add this as a Deploy Key on GitHub) ==="
cat /tmp/jenkins-github-key.pub
```

Then add the **public key** as a deploy key on GitHub:
1. Go to `https://github.com/tresundios/lv360/settings/keys`
2. Click **Add deploy key**
3. Title: `jenkins-lamviec360`
4. Key: Paste the public key
5. Allow write access: ❌ unchecked (read-only is fine)
6. Click **Add key**

### 3.8 Test GitHub connectivity

```bash
ssh -i /tmp/jenkins-github-key -T git@github.com
```

Expected: `Hi tresundios/lv360! You've successfully authenticated...`

### 3.9 Cleanup temp keys (after adding them to Jenkins GUI)

```bash
# Only run this AFTER you've pasted the private keys into Jenkins credentials
rm -f /tmp/jenkins-deploy-key /tmp/jenkins-deploy-key.pub
rm -f /tmp/jenkins-github-key /tmp/jenkins-github-key.pub
```

---

## 4. Required Jenkins Plugins

Go to **https://jenkins.lamviec360.com** → **Manage Jenkins** → **Manage Plugins** → **Available plugins**

Search and install each plugin below. Check the box and click **Install without restart** (or **Download now and install after restart**).

### Must-Have Plugins

| Plugin | Why it's needed | Used by |
|--------|----------------|---------|
| **Pipeline** | Core pipeline functionality (`pipeline {}` syntax) | Both pipelines |
| **Pipeline: Stage View** | Visual stage progress in pipeline UI | Both pipelines |
| **Git** | Git SCM checkout (`checkout scm`) | Both pipelines |
| **GitHub Integration** | `githubPush()` trigger, GitHub webhook | Both pipelines |
| **SSH Agent** | `sshagent()` step for SSH deploy | Both pipelines (Deploy stage) |
| **Docker Pipeline** | Docker commands in pipeline | Both pipelines (Build/Push) |
| **Credentials Binding** | `withCredentials()` for Docker Hub login | Both pipelines (Push stage) |
| **Timestamps** | `timestamps()` option in pipeline | Both pipelines |
| **JUnit** | `junit` step for test result publishing | Both pipelines (Test stage) |

### Recommended Plugins

| Plugin | Why |
|--------|-----|
| **Blue Ocean** | Modern UI for pipeline visualization |
| **Workspace Cleanup** | Auto-clean workspace after builds to save disk |
| **Build Timeout** | Already used via `timeout()` but good to have explicitly |
| **Rebuilder** | Easy "Rebuild" button on failed builds |
| **Slack Notification** (optional) | Send build notifications to Slack |
| **Email Extension** (optional) | Send build failure emails |

### How to install via CLI (alternative)

If you prefer CLI over the GUI:

```bash
# SSH into Jenkins server
ssh root@103.175.146.36

# Install plugins using jenkins-cli
JENKINS_URL="http://localhost:8080"
JENKINS_CLI="/var/lib/jenkins/jenkins-cli.jar"

# Download the CLI jar if it doesn't exist
wget -q "${JENKINS_URL}/jnlpJars/jenkins-cli.jar" -O ${JENKINS_CLI} 2>/dev/null

# Install all required plugins
java -jar ${JENKINS_CLI} -s ${JENKINS_URL} -auth admin:YOUR_ADMIN_PASSWORD install-plugin \
    workflow-aggregator \
    git \
    github \
    ssh-agent \
    docker-workflow \
    credentials-binding \
    timestamper \
    junit \
    blueocean \
    ws-cleanup \
    rebuild

# Restart Jenkins to activate plugins
systemctl restart jenkins
```

### Verify plugins are installed

After restart, go to **Manage Jenkins** → **Manage Plugins** → **Installed** tab and confirm all plugins appear.

---

## 5. Jenkins Credentials Setup (GUI)

Go to **https://jenkins.lamviec360.com** → **Manage Jenkins** → **Credentials** → **System** → **Global credentials (unrestricted)** → **Add Credentials**

You need to create **3 credentials**:

---

### Credential 1: Docker Hub Login

Used by both pipelines to push images to Docker Hub.

| Field | Value |
|-------|-------|
| **Kind** | Username with password |
| **Scope** | Global |
| **ID** | `dockerhub-credentials` |
| **Description** | Docker Hub - navistresundios |
| **Username** | `navistresundios` |
| **Password** | Your Docker Hub access token |

> **How to get a Docker Hub access token:**
> 1. Go to https://hub.docker.com/settings/security
> 2. Click **New Access Token**
> 3. Description: `jenkins-lamviec360`
> 4. Access permissions: **Read & Write**
> 5. Click **Generate**
> 6. Copy the token — this is your "password"

**⚠️ Important:** The ID must be exactly `dockerhub-credentials` — this is referenced in both Jenkinsfiles.

---

### Credential 2: SSH Key for Dev Server

Used by both pipelines to SSH into `103.175.146.37` and deploy.

| Field | Value |
|-------|-------|
| **Kind** | SSH Username with private key |
| **Scope** | Global |
| **ID** | `ssh-dev-server` |
| **Description** | SSH deploy key for dev server (103.175.146.37) |
| **Username** | `deploy` |
| **Private Key** | ○ Enter directly → click **Add** |

Paste the **entire** contents of the private key from step 3.4, including:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...all the key content...
-----END OPENSSH PRIVATE KEY-----
```

**⚠️ Important:** The ID must be exactly `ssh-dev-server` — the Jenkinsfile constructs this as `ssh-${TARGET_ENV}-server` where TARGET_ENV=`dev`.

---

### Credential 3: GitHub SSH Key

Used by both pipelines to checkout code from GitHub.

| Field | Value |
|-------|-------|
| **Kind** | SSH Username with private key |
| **Scope** | Global |
| **ID** | `github-ssh` |
| **Description** | GitHub SSH key for tresundios/lv360 repo |
| **Username** | `git` |
| **Private Key** | ○ Enter directly → click **Add** |

Paste the **entire** contents of the GitHub private key from step 3.7.

---

### Verify credentials

After adding all 3, your credentials page should show:

```
ID                      Type                        Description
──────────────────────  ──────────────────────────  ─────────────────────────────
dockerhub-credentials   Username with password       Docker Hub - navistresundios
ssh-dev-server          SSH Username with private key SSH deploy key for dev server
github-ssh              SSH Username with private key GitHub SSH key for lv360 repo
```

---

## 6. Pipeline 1: lv360-backend

### Create the pipeline

1. Go to **https://jenkins.lamviec360.com**
2. Click **New Item** (left sidebar)
3. Enter name: **`lv360-backend`**
4. Select **Pipeline**
5. Click **OK**

### Configure — General tab

| Setting | Value |
|---------|-------|
| ☑ **GitHub project** | `https://github.com/tresundios/lv360/` |
| ☑ **This project is parameterized** | (Already defined in Jenkinsfile, but check this box) |
| ☑ **Do not allow concurrent builds** | ✅ |
| ☑ **Discard old builds** | Max # of builds to keep: `20` |

### Configure — Build Triggers tab

| Setting | Value |
|---------|-------|
| ☑ **GitHub hook trigger for GITScm polling** | ✅ Check this |

This enables the `githubPush()` trigger in the Jenkinsfile.

### Configure — Pipeline tab

| Setting | Value |
|---------|-------|
| **Definition** | Pipeline script from SCM |
| **SCM** | Git |
| **Repository URL** | `git@github.com:tresundios/lv360.git` |
| **Credentials** | Select `github-ssh` (the one you created in step 5) |
| **Branches to build** | `*/dev` |
| **Script Path** | `jenkins/Jenkinsfile.backend` |
| **Lightweight checkout** | ☑ Checked |

### Save

Click **Save** at the bottom.

### What this pipeline does (stage by stage)

```
lv360-backend Pipeline
│
├── [Checkout]         Clone dev branch from GitHub
│
├── [Test]             Build test image from Dockerfile.prod (builder stage)
│                      Run: pytest tests/ -v
│                      Publish JUnit results
│
├── [Docker Build]     Build production image:
│                      navistresundios/lamviec360-backend:dev-{BUILD_NUMBER}
│                      navistresundios/lamviec360-backend:dev-latest
│
├── [Docker Push]      Login to Docker Hub (dockerhub-credentials)
│                      Push both tags
│
├── [Run Migrations]   SSH to 103.175.146.37 (ssh-dev-server)
│                      Run: alembic upgrade head
│
└── [Deploy]           SSH to 103.175.146.37
                       docker pull new image
                       docker compose up -d --no-deps --force-recreate fastapi
                       curl health check
```

### Parameters (shown when clicking "Build with Parameters")

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `TARGET_ENV` | Choice | dev | Target environment (dev/qa/uat/prod) |
| `SKIP_TESTS` | Boolean | false | Skip tests (emergency only) |
| `RUN_MIGRATIONS` | Boolean | true | Run Alembic DB migrations |

---

## 7. Pipeline 2: lv360-frontend

### Create the pipeline

1. Click **New Item**
2. Enter name: **`lv360-frontend`**
3. Select **Pipeline**
4. Click **OK**

### Configure — General tab

Same as backend:

| Setting | Value |
|---------|-------|
| ☑ **GitHub project** | `https://github.com/tresundios/lv360/` |
| ☑ **Do not allow concurrent builds** | ✅ |
| ☑ **Discard old builds** | Max # of builds to keep: `20` |

### Configure — Build Triggers tab

| Setting | Value |
|---------|-------|
| ☑ **GitHub hook trigger for GITScm polling** | ✅ |

### Configure — Pipeline tab

| Setting | Value |
|---------|-------|
| **Definition** | Pipeline script from SCM |
| **SCM** | Git |
| **Repository URL** | `git@github.com:tresundios/lv360.git` |
| **Credentials** | Select `github-ssh` |
| **Branches to build** | `*/dev` |
| **Script Path** | `jenkins/Jenkinsfile.frontend` |
| **Lightweight checkout** | ☑ Checked |

### Save

Click **Save**.

### What this pipeline does (stage by stage)

```
lv360-frontend Pipeline
│
├── [Checkout]          Clone dev branch from GitHub
│
├── [Install & Lint]    npm ci + npm run lint + npm run format:check
│                       (runs in node:20-alpine container)
│
├── [Test]              npm test --run
│                       Publish JUnit results
│
├── [Docker Build]      Read VITE_API_URL from env/.env.dev
│                       Build production image with --build-arg:
│                       navistresundios/lamviec360-frontend:dev-{BUILD_NUMBER}
│                       navistresundios/lamviec360-frontend:dev-latest
│
├── [Docker Push]       Login to Docker Hub (dockerhub-credentials)
│                       Push both tags
│
└── [Deploy]            SSH to 103.175.146.37 (ssh-dev-server)
                        docker pull new image
                        docker compose up -d --no-deps --force-recreate react
                        curl health check
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `TARGET_ENV` | Choice | dev | Target environment |
| `SKIP_TESTS` | Boolean | false | Skip tests (emergency only) |

---

## 8. GitHub Webhook Setup

The webhook tells Jenkins to start a build when code is pushed to GitHub.

### 8.1 Create the webhook

1. Go to **https://github.com/tresundios/lv360/settings/hooks**
2. Click **Add webhook**

| Field | Value |
|-------|-------|
| **Payload URL** | `https://jenkins.lamviec360.com/github-webhook/` |
| **Content type** | `application/json` |
| **Secret** | Leave empty (or set a secret and configure in Jenkins) |
| **SSL verification** | ☑ Enable SSL verification |
| **Which events?** | ○ Just the push event |
| **Active** | ☑ |

3. Click **Add webhook**

### 8.2 Verify the webhook

After saving, GitHub sends a test ping. On the webhook page:
- **Recent Deliveries** tab should show a ✅ green checkmark
- Response should be `200 OK` or `302`

If you see a ❌ red X:
- Check that `https://jenkins.lamviec360.com` is accessible from the internet
- Check that the URL ends with `/github-webhook/` (trailing slash is important)

### 8.3 How the trigger flow works

```
Developer merges PR to dev
        │
        ▼
GitHub sends POST to https://jenkins.lamviec360.com/github-webhook/
        │
        ▼
Jenkins receives webhook, checks which pipelines watch the dev branch
        │
        ├── lv360-backend  (branch: */dev) → triggers build
        └── lv360-frontend (branch: */dev) → triggers build
```

> **Note:** Both pipelines trigger on ANY push to `dev`. In the future, you can add path-based filtering so backend only triggers on `backend/**` changes and frontend only triggers on `frontend/**` changes. For now, both will run (the one with no changes will still pass quickly).

---

## 9. Jenkins Security Hardening

### 9.1 Change default admin password

**Manage Jenkins** → **Manage Users** → click your admin user → **Configure** → set a strong password.

### 9.2 Enable HTTPS (if not already)

If Jenkins is behind Nginx:

```bash
# On Jenkins server (103.175.146.36)
apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/jenkins`:

```nginx
server {
    listen 80;
    server_name jenkins.lamviec360.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for Jenkins websocket agents
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/jenkins /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Get SSL
certbot --nginx -d jenkins.lamviec360.com
```

### 9.3 Configure Jenkins URL

**Manage Jenkins** → **Configure System** → **Jenkins Location**:

| Field | Value |
|-------|-------|
| Jenkins URL | `https://jenkins.lamviec360.com/` |
| System Admin e-mail | `admin@lamviec360.com` |

### 9.4 Disable CLI over remoting

**Manage Jenkins** → **Configure Global Security**:
- ☑ **Enable Agent → Controller Access Control**
- CSRF Protection: ☑ **Prevent Cross Site Request Forgery exploits**

### 9.5 Configure authorization

**Manage Jenkins** → **Configure Global Security** → **Authorization**:
- Select **Matrix-based security** or **Project-based Matrix Authorization**
- Give your admin user full permissions
- Remove anonymous access except for the webhook endpoint

---

## 10. Verify Everything Works

### 10.1 First run — Backend pipeline

1. Go to **https://jenkins.lamviec360.com** → click **lv360-backend**
2. Click **Build with Parameters**
3. Set:
   - TARGET_ENV: `dev`
   - SKIP_TESTS: `false`
   - RUN_MIGRATIONS: `true`
4. Click **Build**
5. Click on the build number (e.g., `#1`) → **Console Output**
6. Watch each stage execute

**Expected result:**
```
✅ Checkout     — clones dev branch
✅ Test         — pytest passes (or skipped)
✅ Docker Build — image built successfully
✅ Docker Push  — image visible at hub.docker.com/r/navistresundios/lamviec360-backend
✅ Migrations   — alembic runs on deploy server
✅ Deploy       — fastapi restarted, health check passes
```

### 10.2 First run — Frontend pipeline

Same steps for **lv360-frontend**.

### 10.3 Verify on deploy server

SSH into the deploy server and check:

```bash
ssh deploy@103.175.146.37

# Check running containers
docker compose -f /opt/lamviec360/docker-compose.dev.yml ps

# Expected output:
# NAME                    STATUS
# lv360_fastapi_dev       Up (healthy)
# lv360_react_dev         Up
# lv360_postgres_dev      Up (healthy)
# lv360_redis_dev         Up (healthy)
# lv360_pgbackup_dev      Up
```

### 10.4 Verify via domains

| URL | Expected |
|-----|----------|
| `https://dev.lamviec360.com/health` | `{"status": "ok"}` |
| `https://dev.lamviec360.com/docs` | FastAPI Swagger UI |
| `https://appdev.lamviec360.com` | React app loads |

### 10.5 Verify auto-trigger

1. Make a small change on a feature branch
2. Create a PR to `dev` on GitHub
3. Merge the PR
4. Watch Jenkins — both pipelines should start automatically within seconds

---

## 11. Jenkins Maintenance Commands

Run these on the Jenkins server (`103.175.146.36`) as needed.

### Restart Jenkins

```bash
systemctl restart jenkins
```

### View Jenkins logs

```bash
journalctl -u jenkins -f --no-pager -n 100
```

### Clean up Docker images (free disk space)

```bash
# Remove unused Docker images on Jenkins server
docker image prune -a -f --filter "until=168h"

# Remove dangling images
docker image prune -f

# Check disk usage
docker system df
df -h
```

### Backup Jenkins configuration

```bash
# Jenkins home is at /var/lib/jenkins
tar -czf /backup/jenkins-config-$(date +%Y%m%d).tar.gz \
    /var/lib/jenkins/config.xml \
    /var/lib/jenkins/credentials.xml \
    /var/lib/jenkins/jobs/*/config.xml \
    /var/lib/jenkins/users/ \
    /var/lib/jenkins/secrets/
```

### Update Jenkins

```bash
apt update && apt upgrade -y jenkins
systemctl restart jenkins
```

---

## 12. Quick Reference Card

### Servers

| Server | IP | Domain | SSH |
|--------|----|--------|-----|
| Jenkins | 103.175.146.36 | jenkins.lamviec360.com | `ssh root@103.175.146.36` |
| Dev Deploy | 103.175.146.37 | dev.lamviec360.com / appdev.lamviec360.com | `ssh deploy@103.175.146.37` |

### Pipelines

| Pipeline | Jenkinsfile | Branch | Deploys |
|----------|-------------|--------|---------|
| lv360-backend | `jenkins/Jenkinsfile.backend` | `*/dev` | FastAPI + migrations |
| lv360-frontend | `jenkins/Jenkinsfile.frontend` | `*/dev` | React/Nginx |

### Credentials (IDs must match exactly)

| ID | Type | Used for |
|----|------|----------|
| `dockerhub-credentials` | Username + password | Docker Hub push |
| `ssh-dev-server` | SSH key | Deploy to 103.175.146.37 |
| `github-ssh` | SSH key | GitHub checkout |

### Docker Hub Repositories

| Repo | URL |
|------|-----|
| Backend | https://hub.docker.com/r/navistresundios/lamviec360-backend |
| Frontend | https://hub.docker.com/r/navistresundios/lamviec360-frontend |

### Image Tag Convention

| Tag | Meaning | Example |
|-----|---------|---------|
| `dev-{N}` | Immutable build tag | `dev-42` |
| `dev-latest` | Rolling latest for dev | Always points to newest |

### Key Paths on Deploy Server

```
/opt/lamviec360/
├── docker-compose.dev.yml
├── env/.env.dev
└── backend/scripts/backup.sh
```

### Useful Jenkins URLs

| URL | Purpose |
|-----|---------|
| `https://jenkins.lamviec360.com/` | Dashboard |
| `https://jenkins.lamviec360.com/job/lv360-backend/` | Backend pipeline |
| `https://jenkins.lamviec360.com/job/lv360-frontend/` | Frontend pipeline |
| `https://jenkins.lamviec360.com/credentials/` | Manage credentials |
| `https://jenkins.lamviec360.com/pluginManager/` | Manage plugins |
| `https://jenkins.lamviec360.com/manage/` | System management |

### Setup Order Checklist

```
CLI (Jenkins Server 103.175.146.36):
  [ ] 1. Verify Jenkins running (systemctl status jenkins)
  [ ] 2. Install Docker + add jenkins to docker group
  [ ] 3. Install Git
  [ ] 4. Generate SSH deploy key → save both keys
  [ ] 5. Add public key to deploy server authorized_keys
  [ ] 6. Test SSH: ssh deploy@103.175.146.37 "echo ok"
  [ ] 7. Generate GitHub SSH key → save both keys
  [ ] 8. Add public key as GitHub deploy key
  [ ] 9. Test GitHub: ssh -T git@github.com

GUI (https://jenkins.lamviec360.com):
  [ ] 10. Install required plugins (9 must-have)
  [ ] 11. Restart Jenkins after plugin install
  [ ] 12. Add credential: dockerhub-credentials
  [ ] 13. Add credential: ssh-dev-server
  [ ] 14. Add credential: github-ssh
  [ ] 15. Create pipeline: lv360-backend
  [ ] 16. Create pipeline: lv360-frontend
  [ ] 17. Set Jenkins URL in Configure System

GitHub (https://github.com/tresundios/lv360):
  [ ] 18. Add webhook: jenkins.lamviec360.com/github-webhook/
  [ ] 19. Verify webhook shows green checkmark

First Run:
  [ ] 20. Build lv360-backend with parameters → verify all stages pass
  [ ] 21. Build lv360-frontend with parameters → verify all stages pass
  [ ] 22. Check https://dev.lamviec360.com/health
  [ ] 23. Check https://appdev.lamviec360.com

CLI Cleanup:
  [ ] 24. Delete temp key files from /tmp/
```
