# LamViec360 — CI/CD Pipeline & Tagging Strategy

## Current Implementation

Every Jenkins build produces **two Docker image tags** per service:

| Tag Pattern | Example | Type | Purpose |
|-------------|---------|------|---------|
| `{env}-{BUILD_NUMBER}` | `dev-42` | Immutable | Never overwritten. Used for rollbacks. |
| `{env}-latest` | `dev-latest` | Rolling | Always points to the newest build. Used as default. |

### Where this is defined

**Backend** — `jenkins/Jenkinsfile.backend`:
```groovy
IMAGE_TAG    = "${params.TARGET_ENV}-${BUILD_NUMBER}"       // e.g. dev-42
IMAGE_FULL   = "${DOCKER_REGISTRY}/${DOCKER_REPO}:${IMAGE_TAG}"   // navistresundios/lamviec360-backend:dev-42
IMAGE_LATEST = "${DOCKER_REGISTRY}/${DOCKER_REPO}:${params.TARGET_ENV}-latest"  // navistresundios/lamviec360-backend:dev-latest
```

**Frontend** — `jenkins/Jenkinsfile.frontend`: Same pattern.

### What gets pushed to Docker Hub

After build #42 on dev:

```
navistresundios/lamviec360-backend:dev-42       ← immutable
navistresundios/lamviec360-backend:dev-latest   ← updated to point to dev-42
navistresundios/lamviec360-frontend:dev-42      ← immutable
navistresundios/lamviec360-frontend:dev-latest  ← updated to point to dev-42
```

---

## Why Build Number, Not Git Commit Hash

### Option comparison

| Approach | Tag example | Pros | Cons |
|----------|-------------|------|------|
| **Build number** (current) | `dev-42` | Sequential, easy to compare, simple rollback | Need Jenkins to map build → commit |
| **Git commit hash** | `dev-abc1234` | Direct git traceability | Not sequential, harder to compare, extra logic |
| **Both** | `dev-42` + `dev-abc1234` | Best of both | 3x tags per build, more storage, more complexity |

### Decision: Build number only

**Rationale:**

1. **Simple to communicate** — "Roll back to build 42" is immediately clear. "Roll back to abc1234" requires looking up what that commit was.

2. **Sequential ordering** — Build 43 is obviously newer than 42. With commit hashes `abc1234` vs `def5678`, you can't tell which is newer at a glance.

3. **Jenkins native** — `BUILD_NUMBER` is always available with zero extra logic.

4. **Git traceability is not lost** — Every build's Jenkins console output already logs the exact commit hash in the Checkout stage:
   ```
   Building commit abc1234 on branch dev
   ```
   You can always look up which commit corresponds to which build in Jenkins.

5. **Rollback is build-number-driven** — In practice, you always think "go back to the last working build" which is a build number, not a commit hash.

6. **Less Docker Hub storage** — Two tags per build instead of three.

### When to reconsider

Add git commit hash tagging if:
- Team grows to 10+ developers and tracing production issues to commits becomes a bottleneck
- You adopt GitOps (ArgoCD, Flux) where deployments are driven by git state
- You move to a system without sequential build numbers (e.g., GitHub Actions with run IDs)

---

## Tag Lifecycle Per Environment

```
Environment     Build Tags (immutable)      Rolling Tag
───────────     ──────────────────────      ───────────
dev             dev-1, dev-2, dev-3 ...     dev-latest
qa              qa-1, qa-2, qa-3 ...        qa-latest
uat             uat-1, uat-2, uat-3 ...     uat-latest
prod            prod-1, prod-2, prod-3 ...  prod-latest
```

Each environment has its **own build number sequence** because each pipeline run targets a specific environment.

---

## Rollback Procedure

### Using immutable tags

Every past build image remains available in Docker Hub. To rollback:

```bash
# SSH into the deploy server
ssh deploy@103.175.146.37
cd /opt/lamviec360

# See current running tag
docker compose -f docker-compose.dev.yml ps
docker inspect lv360_fastapi_dev --format '{{.Config.Image}}'
# Output: navistresundios/lamviec360-backend:dev-45

# Rollback to build 43
sed -i 's|DOCKER_IMAGE_TAG=.*|DOCKER_IMAGE_TAG=dev-43|' env/.env.dev
docker compose -f docker-compose.dev.yml pull fastapi
docker compose -f docker-compose.dev.yml up -d --no-deps --force-recreate fastapi

# Verify
curl -f http://localhost:8000/health
```

### Finding which build to rollback to

1. Go to **https://jenkins.lamviec360.com/job/lv360-backend/**
2. Look at the build history — green builds are successful
3. Pick the last green build number before the broken one

---

## Image Retention Policy

### Recommended cleanup

Over time, Docker Hub accumulates many tags. Recommended retention:

| Environment | Keep last N builds | Cleanup frequency |
|-------------|-------------------|-------------------|
| dev | 20 | Weekly |
| qa | 10 | Bi-weekly |
| uat | 10 | Monthly |
| prod | 50 | Quarterly |

### Cleanup command (run manually or via cron)

Docker Hub doesn't have built-in retention. Options:

1. **Manual via Docker Hub UI** — Delete old tags at hub.docker.com
2. **Jenkins post-build cleanup** — Already implemented in both Jenkinsfiles:
   ```groovy
   cleanup {
       sh "docker rmi ${IMAGE_FULL} ${IMAGE_LATEST} 2>/dev/null || true"
   }
   ```
   This cleans up **local images on the Jenkins server** after each build to save disk space. Docker Hub images are retained.

---

## Summary

| Decision | Choice | Reason |
|----------|--------|--------|
| Primary tag | `{env}-{BUILD_NUMBER}` | Sequential, simple, rollback-friendly |
| Rolling tag | `{env}-latest` | Default for fresh deploys |
| Git commit hash tag | Not used | Adds complexity without proportional value at current team size |
| Rollback method | Change `DOCKER_IMAGE_TAG` in env file + restart | Simple, no Jenkins rebuild needed |
| Traceability | Jenkins console output logs commit per build | No extra tagging needed |
