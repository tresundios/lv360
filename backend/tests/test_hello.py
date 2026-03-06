"""
Tests for the Hello World API endpoints.
Run with: pytest tests/ -v
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_db_session():
    """Create a mock SQLAlchemy session."""
    session = MagicMock()
    return session


@pytest.fixture
def client(mock_db_session):
    """Create a test client with DB dependency overridden at the FastAPI level."""
    from app.database import get_db
    from app.main import app

    def _override_get_db():
        yield mock_db_session

    app.dependency_overrides[get_db] = _override_get_db

    # Patch lifespan helpers that try to connect to the real database
    with patch("app.main.wait_for_db"), \
         patch("app.main.Base"), \
         patch("app.main.seed_hello_world"), \
         TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


class TestHelloDbEndpoint:
    """Tests for GET /api/hello-db"""

    def test_hello_db_returns_message(self, client, mock_db_session):
        mock_record = MagicMock()
        mock_record.message = "Hello World from Postgres"
        mock_record.id = 1
        mock_db_session.query.return_value.first.return_value = mock_record

        response = client.get("/api/hello-db")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "postgres"
        assert data["message"] == "Hello World from Postgres"
        assert data["id"] == 1

    def test_hello_db_returns_404_when_empty(self, client, mock_db_session):
        mock_db_session.query.return_value.first.return_value = None

        response = client.get("/api/hello-db")
        assert response.status_code == 404


class TestHelloCacheEndpoint:
    """Tests for GET /api/hello-cache"""

    @patch("app.routers.hello.get_redis_client")
    def test_hello_cache_miss(self, mock_redis, client, mock_db_session):
        # Redis returns None (cache miss)
        redis_instance = MagicMock()
        redis_instance.get.return_value = None
        mock_redis.return_value = redis_instance

        mock_record = MagicMock()
        mock_record.message = "Hello World from Postgres"
        mock_record.id = 1
        mock_db_session.query.return_value.first.return_value = mock_record

        response = client.get("/api/hello-cache")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "postgres"
        assert data["cached"] is False

    @patch("app.routers.hello.get_redis_client")
    def test_hello_cache_hit(self, mock_redis, client, mock_db_session):
        # Redis returns cached data
        redis_instance = MagicMock()
        redis_instance.get.return_value = json.dumps({
            "message": "Hello World from Postgres",
            "id": 1,
        })
        mock_redis.return_value = redis_instance

        response = client.get("/api/hello-cache")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "redis"
        assert data["cached"] is True


class TestHealthEndpoint:
    """Tests for GET /health"""

    @patch("app.main.check_redis_health")
    def test_health_returns_ok(self, mock_redis_health, client):
        mock_redis_health.return_value = True
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
