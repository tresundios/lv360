#!/bin/bash
###############################################################################
# git-setup.sh — Initialize git repo with branching strategy
# Run from the root of the lv360 directory
###############################################################################

set -e

echo "=== LamViec 360 — Git Repository Setup ==="

# Remove existing sub-repo .git directories (merge into monorepo)
rm -rf backend/.git
rm -rf frontend/.git

# Initialize root-level git
git init

# Initial commit
git add .
git commit -m "feat: enterprise architecture — Docker, CI/CD, multi-env setup

- Phase 1: Local Docker replication (docker-compose.local.yml)
- Phase 2: Environment management (env/.env.*)
- Phase 3: Hello World flow (DB → Redis → Backend → Frontend)
- Phase 4: Git branching strategy
- Phase 5: Jenkins CI/CD pipelines (backend + frontend)
- Phase 6: Alembic database migration strategy
- Phase 7: Multi-environment compose files (dev/qa/uat/prod)"

# Create dev branch
git branch dev
git checkout dev

echo ""
echo "=== Setup Complete ==="
echo "Current branch: $(git branch --show-current)"
echo ""
echo "Next steps:"
echo "  1. Add remote:  git remote add origin <repo-url>"
echo "  2. Push main:   git checkout main && git push -u origin main"
echo "  3. Push dev:    git checkout dev && git push -u origin dev"
echo "  4. Features:    git checkout -b feature/LV-XXX-description"
echo ""
