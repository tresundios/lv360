# lv360-frontend — Jenkins Pipeline Setup Guide

## Table of Contents

1. [Overview](#1-overview)
2. [Pre-requisites Checklist](#2-pre-requisites-checklist)
3. [Potential Issues to Fix Before First Run](#3-potential-issues-to-fix-before-first-run)
4. [Step-by-Step: Create the Pipeline in Jenkins](#4-step-by-step-create-the-pipeline-in-jenkins)
5. [Step-by-Step: First Manual Build](#5-step-by-step-first-manual-build)
6. [Pipeline Stages Explained](#6-pipeline-stages-explained)
7. [Deploy Server Setup](#7-deploy-server-setup)
8. [Verification & Testing](#8-verification--testing)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Overview

### Pipeline Flow

```
Push to dev (frontend/ files changed)
    │
    ▼
┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Checkout  │──▶│ Install &    │──▶│   Test   │──▶│  Docker  │──▶│  Docker  │──▶│  Deploy  │
│           │   │ Lint         │   │ (vitest) │   │  Build   │   │   Push   │   │          │
└──────────┘   └──────────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### What Gets Built

| Stage | Action |
|-------|--------|
| Install & Lint | `npm ci` → `eslint` → `prettier --check` |
| Test | `vitest --run` (skippable) |
| Docker Build | Multi-stage: `node:20-alpine` → `npm run build` → `nginx:1.27-alpine` |
| Docker Push | Push to `navistresundios/lamviec360-frontend:dev-{BUILD_NUMBER}` + `dev-latest` |
| Deploy | SSH → `docker compose up -d --no-deps --force-recreate react` |

### Key Files

| File | Purpose |
|------|---------|
| `jenkins/Jenkinsfile.frontend` | Pipeline definition (already exists) |
| `frontend/Dockerfile.prod` | Multi-stage Docker build (already exists) |
| `frontend/nginx/default.conf` | Nginx config inside the container (already exists) |
| `docker-compose.dev.yml` → `react` service | Runs on deploy server (already exists) |

---

## 2. Pre-requisites Checklist

### Already Done (from backend pipeline setup)

- [x] Jenkins server running at `https://jenkins.lamviec360.com`
- [x] Docker installed on Jenkins server
- [x] Docker installed on deploy server
- [x] `deploy` user on deploy server with SSH key access
- [x] Credential: `dockerhub-credentials` (Docker Hub login)
- [x] Credential: `ssh-dev-server` (SSH key for deploy server)
- [x] Credential: `github-ssh` (SSH key for GitHub checkout)
- [x] GitHub webhook configured
- [x] `docker-compose.dev.yml` on deploy server
- [x] `env/.env.dev` on deploy server with `VITE_API_URL` and `VITE_ENVIRONMENT`

### Still Needed

- [ ] Create the `lv360-frontend` pipeline job in Jenkins UI
- [ ] Create Docker Hub repository `navistresundios/lamviec360-frontend` (if not exists)
- [ ] Fix potential test/lint issues (see Section 3)
- [ ] Push the first frontend Docker image so `react` service can start

---

## 3. Potential Issues to Fix Before First Run

### Issue 1: `.storybook` directory missing (CRITICAL)

The `vite.config.ts` test configuration references `.storybook/vitest.setup.ts` and uses `storybookTest()` plugin. But there's **no `.storybook` directory** in the frontend.

**Impact:** The `Test` stage will fail.

**Fix Options:**

**Option A: Skip tests for now (quick)**

Run the first build with `SKIP_TESTS=true` parameter in Jenkins. Fix the test config later.

**Option B: Create a minimal `.storybook` config**

```bash
cd frontend

mkdir -p .storybook

cat > .storybook/main.ts << 'EOF'
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
};

export default config;
EOF

cat > .storybook/vitest.setup.ts << 'EOF'
import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react";
import * as projectAnnotations from "./preview";

const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
EOF

cat > .storybook/preview.ts << 'EOF'
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
EOF
```

**Option C: Remove Storybook test config from vitest (recommended for CI)**

Simplify `vite.config.ts` to exclude browser-based Storybook tests in CI (they require Playwright and a browser). Keep only unit tests for CI.

### Issue 2: Lint/format may fail on first run

The `Install & Lint` stage runs `npm run lint && npm run format:check`. If there are any lint or formatting issues, the pipeline will fail.

**Fix:** Run locally first to verify:

```bash
cd frontend
npm ci
npm run lint
npm run format:check
```

Fix any issues before triggering the pipeline.

### Issue 3: Test uses Playwright browser (heavy for CI)

The `vite.config.ts` uses `@vitest/browser-playwright` which requires an actual browser. This is very heavy for a Jenkins CI environment.

**Recommended:** For the initial pipeline, use `SKIP_TESTS=true`. Later, configure vitest with `jsdom` environment for fast headless tests in CI.

### Issue 4: Frontend port on deploy server

The `docker-compose.dev.yml` maps the react service to port `3080:80`. The Jenkinsfile health check curls `http://localhost:80/` — this should be `http://localhost:3080/`.

**This will be fixed in the Jenkinsfile before the first run.**

---

## 4. Step-by-Step: Create the Pipeline in Jenkins

### Step 1: Verify Docker Hub Repository

Go to https://hub.docker.com and check if the repository `navistresundios/lamviec360-frontend` exists.

If not, it will be **auto-created** on the first `docker push`. Docker Hub free accounts allow unlimited public repos.

### Step 2: Create the Pipeline in Jenkins UI

1. Go to **https://jenkins.lamviec360.com**
2. Click **New Item** (left sidebar)
3. Configure:

| Field | Value |
|-------|-------|
| **Item name** | `lv360-frontend` |
| **Type** | Pipeline |

4. Click **OK**

### Step 3: Configure the Pipeline

In the pipeline configuration page:

#### General Tab

| Setting | Value |
|---------|-------|
| **GitHub project** | ✅ Check this box |
| **Project url** | `https://github.com/tresundios/lv360` |

#### Build Triggers

| Setting | Value |
|---------|-------|
| **GitHub hook trigger for GITScm polling** | ✅ Check this box |

#### Pipeline Section

| Setting | Value |
|---------|-------|
| **Definition** | Pipeline script from SCM |
| **SCM** | Git |
| **Repository URL** | `git@github.com:tresundios/lv360.git` |
| **Credentials** | `github-ssh` |
| **Branch Specifier** | `*/dev` |
| **Script Path** | `jenkins/Jenkinsfile.frontend` |

5. Click **Save**

---

## 5. Step-by-Step: First Manual Build

### Step 1: Fix the health check port

Before running, the Jenkinsfile.frontend health check needs to be fixed (see Section 3, Issue 4). This fix will be applied in the code.

### Step 2: Trigger the first build

1. Go to **https://jenkins.lamviec360.com/job/lv360-frontend/**
2. Click **Build with Parameters** (left sidebar)
3. Set parameters:

| Parameter | Value |
|-----------|-------|
| TARGET_ENV | `dev` |
| SKIP_TESTS | `true` ← **Check this for the first run** |

4. Click **Build**

### Step 3: Monitor the build

1. Click on the build number (e.g., `#1`) in the Build History
2. Click **Console Output** to watch live logs
3. Expected flow:

```
✅ Checkout      — Checks out dev branch, detects frontend-relevant files
✅ Install & Lint — npm ci + eslint + prettier (may fail if code has issues)
⏭️ Test          — Skipped (SKIP_TESTS=true)
✅ Docker Build  — Multi-stage: node build → nginx image
✅ Docker Push   — Pushes to Docker Hub
✅ Deploy        — SSH to 103.175.146.37, docker compose up react
```

### Step 4: Verify

After the build succeeds:

```bash
# Check the image was pushed
docker pull navistresundios/lamviec360-frontend:dev-latest

# Check the container is running on the deploy server
ssh deploy@103.175.146.37 "docker ps | grep react"

# Test the frontend
curl -s -o /dev/null -w '%{http_code}' http://103.175.146.37:3080/
# Should return 200
```

Or visit: `https://appdev.lamviec360.com` (if Nginx reverse proxy is configured)

---

## 6. Pipeline Stages Explained

### Stage 1: Checkout

- Checks out code from `git@github.com:tresundios/lv360.git` (branch `dev`)
- Detects changed files using `git diff --name-only HEAD~1 HEAD`
- **Skips entire pipeline** if no `frontend/`, `docker-compose*`, `env/`, or `jenkins/Jenkinsfile.frontend` files changed

### Stage 2: Install & Lint

- Runs inside a disposable `node:20-alpine` Docker container
- Executes: `npm ci && npm run lint && npm run format:check`
- **Fails the pipeline** if there are lint or formatting violations

### Stage 3: Test

- Runs inside a disposable `node:20-alpine` Docker container
- Executes: `npm test -- --run`
- Collects JUnit XML results (if configured in vitest)
- **Skippable** via `SKIP_TESTS=true` parameter
- ⚠️ Currently uses Storybook + Playwright (heavy); recommend switching to jsdom for CI

### Stage 4: Docker Build

- Reads `VITE_API_URL` and `VITE_ENVIRONMENT` from `env/.env.{TARGET_ENV}`
- Passes them as `--build-arg` to inject at build time (Vite requires this)
- Multi-stage build:
  1. `node:20-alpine` — `npm ci`
  2. `node:20-alpine` — `npm run build` (creates `dist/`)
  3. `nginx:1.27-alpine` — copies `dist/` into nginx, adds custom config
- Tags: `dev-{BUILD_NUMBER}` and `dev-latest`

### Stage 5: Docker Push

- Logs into Docker Hub using `dockerhub-credentials`
- Pushes both tags to `navistresundios/lamviec360-frontend`

### Stage 6: Deploy

- SSHes into deploy server (`103.175.146.37`)
- `git pull origin dev` — syncs compose files
- `docker pull` the new image
- Updates `DOCKER_IMAGE_TAG` in env file
- `docker compose up -d --no-deps --force-recreate react` — restarts only the react service
- Health check: `curl http://localhost:3080/`

---

## 7. Deploy Server Setup

### Already Done

The deploy server already has everything needed from the backend pipeline setup:

- [x] `deploy` user with Docker access
- [x] Git repo cloned at `/opt/lamviec360`
- [x] `docker-compose.dev.yml` with `react` service on port `3080:80`
- [x] `env/.env.dev` with `VITE_API_URL=https://dev.lamviec360.com`
- [x] Nginx reverse proxy: `appdev.lamviec360.com` → `localhost:3080`

### Verify Nginx on Deploy Server (if not done)

If the frontend domain isn't working yet, ensure Nginx is configured:

```nginx
# /etc/nginx/sites-available/lamviec360-dev (frontend section)
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

Then: `sudo certbot --nginx -d appdev.lamviec360.com`

---

## 8. Verification & Testing

### After First Successful Build

| Check | Command / URL | Expected |
|-------|--------------|----------|
| Docker Hub image | `docker pull navistresundios/lamviec360-frontend:dev-latest` | Image pulls successfully |
| Container running | `ssh deploy@103.175.146.37 "docker ps \| grep react"` | `lv360_react_dev` container is Up |
| Direct access | `curl http://103.175.146.37:3080/` | Returns HTML |
| Domain access | `https://appdev.lamviec360.com` | React app loads |
| Health check | Container has built-in `wget` health check | `docker inspect --format='{{.State.Health.Status}}' lv360_react_dev` → `healthy` |

### Verify Path-Based Triggering

1. Make a change **only** in `backend/` → push to `dev`
2. The `lv360-frontend` pipeline should start but **skip all stages** after Checkout
3. Console output should show: `"No frontend-relevant files changed. Skipping pipeline."`

---

## 9. Troubleshooting

### `npm run lint` fails

```bash
# Run locally to see errors
cd frontend
npm ci
npm run lint
# Fix errors, commit, push
```

### `npm run format:check` fails

```bash
# Auto-fix formatting
cd frontend
npm run format
git add . && git commit -m "style: fix formatting" && git push origin dev
```

### Docker Build fails: VITE_API_URL empty

The build stage reads `VITE_API_URL` from `env/.env.dev` on the **Jenkins server**. Make sure the env file exists in the workspace:

```bash
# Check on Jenkins server workspace
ls -la /var/lib/jenkins/workspace/lv360-frontend/env/.env.dev
```

The file should exist because `checkout scm` clones the full repo. But `env/` is gitignored, so the Jenkins build reads it from the **workspace**. 

**Fix:** The Jenkinsfile reads the env file using `readFile("../env/.env.${params.TARGET_ENV}")`. If `env/.env.dev` is gitignored and not in the repo, this will fail.

**Solution:** Either:
1. Add `env/.env.example` to git (it's already there) and use it for build-time VITE vars
2. Or add VITE vars to Jenkins credentials and pass them directly

### Frontend image not found on deploy

```bash
# On deploy server
docker images | grep lamviec360-frontend
# If empty, pull manually:
docker pull navistresundios/lamviec360-frontend:dev-latest
```

### React container exits immediately

```bash
# Check logs
ssh deploy@103.175.146.37 "docker logs lv360_react_dev"
```

Common issues:
- Nginx config error → check `frontend/nginx/default.conf`
- Build produced empty `dist/` → check Vite build output in Jenkins logs

### Port 3080 not accessible

```bash
# Check if container is running and port is mapped
ssh deploy@103.175.146.37 "docker ps | grep react"
# Check if port is open
ssh deploy@103.175.146.37 "curl -s http://localhost:3080/"
```
