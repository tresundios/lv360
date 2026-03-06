# Visual CI/CD Pipeline — Plan & Options

## Why You Need a Visual Pipeline

In production-grade projects, a **visual CI/CD dashboard** is a practical standard because:

- **Visibility** — Developers, QA, and management can see build status at a glance
- **Debugging** — Quickly identify which stage failed and why
- **Audit trail** — Track who deployed what, when, and to which environment
- **Confidence** — Green pipeline = safe to ship; red pipeline = investigate before merging
- **Compliance** — Many organizations require visible build/deploy history for audits

---

## Current State

| What you have | Status |
|---------------|--------|
| Jenkins pipeline (backend) | ✅ Working |
| Jenkins pipeline (frontend) | ✅ Configured |
| Pipeline stages: Test → Build → Push → Deploy → Migrate → Health Check | ✅ All passing |
| Visual dashboard | ❌ Not configured |

---

## Option 1: Jenkins Blue Ocean (Recommended — Quick Win)

**Blue Ocean** is a Jenkins plugin that provides a modern visual pipeline UI out of the box.

### What it looks like

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Checkout  │──▶│   Test   │──▶│  Build   │──▶│   Push   │──▶│  Deploy  │──▶│  Health  │
│    ✅     │   │    ✅    │   │    ✅    │   │    ✅    │   │    ✅    │   │    ✅    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

Each stage is a clickable node showing logs, duration, and pass/fail status.

### Setup Steps

```
1. Install the "Blue Ocean" plugin
   Jenkins → Manage Jenkins → Manage Plugins → Available → Search "Blue Ocean" → Install

2. Restart Jenkins

3. Access the visual pipeline at:
   https://jenkins.lamviec360.com/blue/

4. Click on any pipeline (lv360-backend / lv360-frontend) to see:
   - Stage-by-stage visual flow
   - Per-stage logs (click any stage node)
   - Build history timeline
   - Branch-level filtering
```

### Pros & Cons

| Pros | Cons |
|------|------|
| Zero code changes | Plugin is in maintenance mode (no new features) |
| Works with existing Jenkinsfiles | Requires Jenkins plugin install |
| Beautiful stage visualization | Limited customization |
| Built-in branch filtering | |
| Free | |

### Effort: ~15 minutes

---

## Option 2: GitHub Actions (Industry Standard — Migration)

Migrate from Jenkins to **GitHub Actions** for a fully integrated CI/CD experience inside GitHub.

### What it looks like

Visual pipeline directly in every Pull Request and under the **Actions** tab on GitHub.

### Setup Steps

```
1. Create workflow files:
   .github/workflows/backend.yml
   .github/workflows/frontend.yml

2. Configure GitHub Secrets:
   Settings → Secrets and variables → Actions → New repository secret
   - DOCKERHUB_USERNAME
   - DOCKERHUB_TOKEN
   - DEPLOY_SSH_KEY
   - DEPLOY_HOST

3. Migrate Jenkinsfile stages to GitHub Actions jobs:
   - checkout → actions/checkout@v4
   - test → docker build + docker run pytest
   - build → docker/build-push-action@v5
   - push → docker/login-action + docker/build-push-action
   - deploy → ssh-action or self-hosted runner
   - health check → curl in SSH step

4. Add status badges to README.md:
   ![Backend CI](https://github.com/tresundios/lv360/actions/workflows/backend.yml/badge.svg)

5. Decommission Jenkins (optional)
```

### Example workflow structure

```yaml
# .github/workflows/backend.yml
name: Backend CI/CD
on:
  push:
    branches: [dev]
    paths: [backend/**]

jobs:
  test:
    runs-on: ubuntu-latest
    steps: ...

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps: ...

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps: ...

  health-check:
    needs: deploy
    runs-on: ubuntu-latest
    steps: ...
```

### Pros & Cons

| Pros | Cons |
|------|------|
| Visual pipeline in every PR | Requires migration effort |
| Native GitHub integration | GitHub Actions minutes may cost money (free tier: 2000 min/month) |
| Status badges in README | Need to set up secrets again |
| Matrix builds, caching, artifacts | |
| Industry standard for GitHub repos | |
| No separate Jenkins server needed | |

### Effort: ~4-6 hours (migration)

---

## Option 3: Jenkins + GitHub Commit Status API (Lightweight)

Keep Jenkins but push **build status** back to GitHub so PRs show pass/fail.

### What it looks like

In every Pull Request on GitHub:
```
✅ lv360-backend — Build #12 succeeded (details)
✅ lv360-frontend — Build #8 succeeded (details)
```

### Setup Steps

```
1. Install "GitHub Branch Source" plugin in Jenkins (likely already installed)

2. Create a GitHub Personal Access Token with `repo:status` scope
   GitHub → Settings → Developer settings → Personal access tokens → Generate

3. Add token to Jenkins:
   Manage Jenkins → Credentials → Add → Secret text
   ID: github-status-token

4. Add to Jenkinsfile.backend post section:
   post {
       success {
           githubNotify status: 'SUCCESS', description: 'Backend pipeline passed'
       }
       failure {
           githubNotify status: 'FAILURE', description: 'Backend pipeline failed'
       }
   }

5. Enable "Branch Protection" on GitHub:
   Settings → Branches → dev → Require status checks to pass
   Select: lv360-backend, lv360-frontend
```

### Pros & Cons

| Pros | Cons |
|------|------|
| PR-level status visibility | No stage-by-stage view in GitHub |
| Branch protection (block bad merges) | Still need Jenkins for full logs |
| Minimal setup | |
| Free | |

### Effort: ~30 minutes

---

## Option 4: Grafana + Prometheus (Advanced Monitoring)

For teams that want **metrics dashboards** — build duration trends, success rates, deploy frequency.

### What it looks like

A Grafana dashboard showing:
- Build success/failure rate over time
- Average build duration per stage
- Deploy frequency (deploys per day/week)
- DORA metrics (Lead Time, MTTR, Change Failure Rate, Deploy Frequency)

### Setup Steps

```
1. Install Jenkins Prometheus plugin
   Jenkins → Manage Plugins → Install "Prometheus Metrics"

2. Deploy Prometheus + Grafana on the deploy server (or a separate monitoring server)
   docker compose -f docker-compose.monitoring.yml up -d

3. Configure Prometheus to scrape Jenkins:
   - target: jenkins.lamviec360.com:8080/prometheus

4. Import Grafana dashboard for Jenkins (Dashboard ID: 9964)

5. Add custom panels for:
   - Pipeline success rate
   - Stage duration breakdown
   - Deploy frequency
```

### Pros & Cons

| Pros | Cons |
|------|------|
| Rich metrics and trends | Complex setup |
| DORA metrics for engineering leadership | Requires additional infrastructure |
| Alerting (Slack/email on failure) | Overkill for small teams |
| Beautiful dashboards | |

### Effort: ~1-2 days

---

## Recommendation

| Team Size | Recommendation | Why |
|-----------|---------------|-----|
| 1-3 devs (your current stage) | **Option 1 (Blue Ocean)** + **Option 3 (GitHub Status)** | Quick win, visual pipeline + PR status |
| 3-10 devs | **Option 2 (GitHub Actions)** | Eliminate Jenkins, native GitHub experience |
| 10+ devs / Enterprise | **Option 2 + Option 4** | Full CI/CD + metrics + DORA tracking |

### Suggested Implementation Order

```
Phase 1 (Today — 30 min):
  ✅ Install Blue Ocean plugin on Jenkins
  ✅ Access visual pipeline at /blue/

Phase 2 (This week — 30 min):
  ✅ Set up GitHub commit status integration
  ✅ Enable branch protection on dev

Phase 3 (Next sprint — 4-6 hours, optional):
  ⬜ Migrate to GitHub Actions
  ⬜ Add status badges to README
  ⬜ Decommission Jenkins

Phase 4 (Future, optional):
  ⬜ Add Grafana + Prometheus for metrics
  ⬜ Set up Slack notifications for build failures
```

---

## Quick Start: Blue Ocean (Do This Now)

SSH into the Jenkins server and install the plugin:

```
1. Go to https://jenkins.lamviec360.com/manage/pluginManager/available

2. Search for "Blue Ocean" → Check the box → Install

3. Restart Jenkins:
   https://jenkins.lamviec360.com/safeRestart

4. Visit the visual pipeline:
   https://jenkins.lamviec360.com/blue/organizations/jenkins/lv360-backend/activity

5. Click on any build to see the stage-by-stage visual flow
```

That's it — you now have a visual CI/CD pipeline.
