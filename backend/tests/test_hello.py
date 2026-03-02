"""
Tests for the Hello World API endpoints.
Run with: pytest tests/ -v
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client with mocked DB and Redis."""
    from app.main import app
    return TestClient(app)


@pytest.fixture
def mock_db_session():
    """Mock SQLAlchemy session."""
    session = MagicMock()
    return session


class TestHelloDbEndpoint:
    """Tests for GET /api/hello-db"""

    @patch("app.routers.hello.get_db")
    def test_hello_db_returns_message(self, mock_get_db, client):
        mock_session = MagicMock()
        mock_record = MagicMock()
        mock_record.message = "Hello World from Postgres"
        mock_record.id = 1
        mock_session.query.return_value.first.return_value = mock_record
        mock_get_db.return_value = iter([mock_session])

        response = client.get("/api/hello-db")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "postgres"
        assert data["message"] == "Hello World from Postgres"
        assert data["id"] == 1

    @patch("app.routers.hello.get_db")
    def test_hello_db_returns_404_when_empty(self, mock_get_db, client):
        mock_session = MagicMock()
        mock_session.query.return_value.first.return_value = None
        mock_get_db.return_value = iter([mock_session])

        response = client.get("/api/hello-db")
        assert response.status_code == 404


class TestHelloCacheEndpoint:
    """Tests for GET /api/hello-cache"""

    @patch("app.routers.hello.get_redis_client")
    @patch("app.routers.hello.get_db")
    def test_hello_cache_miss(self, mock_get_db, mock_redis, client):
        # Redis returns None (cache miss)
        redis_instance = MagicMock()
        redis_instance.get.return_value = None
        mock_redis.return_value = redis_instance

        mock_session = MagicMock()
        mock_record = MagicMock()
        mock_record.message = "Hello World from Postgres"
        mock_record.id = 1
        mock_session.query.return_value.first.return_value = mock_record
        mock_get_db.return_value = iter([mock_session])

        response = client.get("/api/hello-cache")
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "postgres"
        assert data["cached"] is False

    @patch("app.routers.hello.get_redis_client")
    @patch("app.routers.hello.get_db")
    def test_hello_cache_hit(self, mock_get_db, mock_redis, client):
        # Redis returns cached data
        import json
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
