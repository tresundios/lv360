-- ==========================================================================
-- init-db.sql — Seed script for local/dev environments
-- Runs automatically on first postgres container start
-- ==========================================================================

-- Hello World table for Phase 3 verification
CREATE TABLE IF NOT EXISTS hello_world (
    id SERIAL PRIMARY KEY,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data
INSERT INTO hello_world (message) VALUES ('Hello World from Postgres')
ON CONFLICT DO NOTHING;
