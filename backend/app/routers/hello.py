"""
Hello World API routes — Phase 3 verification endpoints.
Demonstrates DB → Backend → Frontend and DB → Redis → Backend → Frontend flows.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import HelloWorld
from app.redis_client import get_redis_client

router = APIRouter(prefix="/api", tags=["hello"])

REDIS_HELLO_KEY = "hello_message"
REDIS_HELLO_TTL = 300  # 5 minutes


@router.get("/hello-db")
def hello_from_db(db: Session = Depends(get_db)):
    """
    Flow: Postgres → FastAPI → Response
    Fetches the hello_world message directly from PostgreSQL.
    """
    record = db.query(HelloWorld).first()
    if not record:
        raise HTTPException(status_code=404, detail="No hello_world record found. Run seed script.")
    return {
        "source": "postgres",
        "message": record.message,
        "id": record.id,
    }


@router.get("/hello-cache")
def hello_from_cache(db: Session = Depends(get_db)):
    """
    Flow: Redis (cache) → Postgres (fallback) → FastAPI → Response
    Checks Redis first; if miss, fetches from Postgres and caches.
    """
    redis_client = get_redis_client()

    # Try Redis cache first
    cached = redis_client.get(REDIS_HELLO_KEY)
    if cached:
        data = json.loads(cached)
        data["source"] = "redis"
        data["cached"] = True
        return data

    # Cache miss — fetch from Postgres
    record = db.query(HelloWorld).first()
    if not record:
        raise HTTPException(status_code=404, detail="No hello_world record found. Run seed script.")

    payload = {
        "message": record.message,
        "id": record.id,
    }

    # Store in Redis with TTL
    redis_client.setex(REDIS_HELLO_KEY, REDIS_HELLO_TTL, json.dumps(payload))

    return {
        "source": "postgres",
        "cached": False,
        "message": record.message,
        "id": record.id,
    }
