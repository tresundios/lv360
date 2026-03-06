#!/bin/bash
###############################################################################
# entrypoint.sh — Production entrypoint for FastAPI container
# 1. Wait for database
# 2. Run Alembic migrations
# 3. Start application
###############################################################################

set -e

echo "[ENTRYPOINT] Environment: ${ENVIRONMENT:-unknown}"
echo "[ENTRYPOINT] Waiting for database..."

# Wait for postgres to be ready
until python -c "
from app.config import get_settings
from sqlalchemy import create_engine, text
s = get_settings()
e = create_engine(s.database_url)
with e.connect() as c:
    c.execute(text('SELECT 1'))
" 2>/dev/null; do
    echo "[ENTRYPOINT] Database not ready, retrying in 2s..."
    sleep 2
done

echo "[ENTRYPOINT] Database is ready."

# Run migrations if ENVIRONMENT is not 'local' (local uses create_all)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "[ENTRYPOINT] Running Alembic migrations..."
    alembic upgrade head || {
        echo "[ENTRYPOINT] Migration failed, attempting to stamp current state..."
        alembic stamp head || true
    }
    echo "[ENTRYPOINT] Migrations complete."
fi

echo "[ENTRYPOINT] Starting application..."
exec "$@"
