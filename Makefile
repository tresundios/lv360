###############################################################################
# Makefile — LamViec 360 Local Development Commands
###############################################################################

COMPOSE_LOCAL = docker compose -f docker-compose.local.yml
COMPOSE_DEV   = docker compose -f docker-compose.dev.yml
COMPOSE_QA    = docker compose -f docker-compose.qa.yml
COMPOSE_UAT   = docker compose -f docker-compose.uat.yml
COMPOSE_PROD  = docker compose -f docker-compose.prod.yml

# ---------------------------------------------------------------------------
# Local Development
# ---------------------------------------------------------------------------

.PHONY: local-up
local-up: ## Start all local services
	$(COMPOSE_LOCAL) up --build -d

.PHONY: local-down
local-down: ## Stop all local services
	$(COMPOSE_LOCAL) down

.PHONY: rebuild
rebuild: ## Rebuild and restart all local services (no cache)
	$(COMPOSE_LOCAL) down
	$(COMPOSE_LOCAL) build --no-cache
	$(COMPOSE_LOCAL) up -d

.PHONY: logs
logs: ## Tail logs from all local services
	$(COMPOSE_LOCAL) logs -f

.PHONY: logs-api
logs-api: ## Tail FastAPI logs only
	$(COMPOSE_LOCAL) logs -f fastapi

.PHONY: logs-fe
logs-fe: ## Tail React logs only
	$(COMPOSE_LOCAL) logs -f react

.PHONY: logs-db
logs-db: ## Tail Postgres logs only
	$(COMPOSE_LOCAL) logs -f postgres

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

.PHONY: db-shell
db-shell: ## Open psql shell
	$(COMPOSE_LOCAL) exec postgres psql -U admin -d lamviec360

.PHONY: db-reset
db-reset: ## Reset database volume (destroys data)
	$(COMPOSE_LOCAL) down -v
	docker volume rm lv360_pgdata 2>/dev/null || true
	$(COMPOSE_LOCAL) up --build -d

.PHONY: migrate
migrate: ## Run Alembic migrations
	$(COMPOSE_LOCAL) exec fastapi alembic upgrade head

.PHONY: migrate-gen
migrate-gen: ## Generate a new Alembic migration (usage: make migrate-gen MSG="add users table")
	$(COMPOSE_LOCAL) exec fastapi alembic revision --autogenerate -m "$(MSG)"

.PHONY: migrate-history
migrate-history: ## Show Alembic migration history
	$(COMPOSE_LOCAL) exec fastapi alembic history

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------

.PHONY: redis-shell
redis-shell: ## Open redis-cli
	$(COMPOSE_LOCAL) exec redis redis-cli

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------

.PHONY: test-api
test-api: ## Run FastAPI tests
	$(COMPOSE_LOCAL) exec fastapi python -m pytest tests/ -v

.PHONY: test-fe
test-fe: ## Run React tests
	$(COMPOSE_LOCAL) exec react npm test

# ---------------------------------------------------------------------------
# Docker Cleanup
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove all project containers, networks, volumes
	$(COMPOSE_LOCAL) down -v --remove-orphans
	docker volume rm lv360_pgdata lv360_redisdata lv360_fe_node_modules 2>/dev/null || true

.PHONY: prune
prune: ## Docker system prune (careful!)
	docker system prune -f

# ---------------------------------------------------------------------------
# Environment-Specific Deployments
# ---------------------------------------------------------------------------

.PHONY: dev-up
dev-up:
	$(COMPOSE_DEV) up -d

.PHONY: dev-down
dev-down:
	$(COMPOSE_DEV) down

.PHONY: qa-up
qa-up:
	$(COMPOSE_QA) up -d

.PHONY: qa-down
qa-down:
	$(COMPOSE_QA) down

.PHONY: uat-up
uat-up:
	$(COMPOSE_UAT) up -d

.PHONY: uat-down
uat-down:
	$(COMPOSE_UAT) down

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
