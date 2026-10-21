ALTER TABLE users ADD COLUMN IF NOT EXISTS exclude_from_learning_stats boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS learning_stats_config (key text PRIMARY KEY, started_at timestamptz NOT NULL);
INSERT INTO learning_stats_config (key, started_at) VALUES ('reading_started_at', now()) ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS learning_read_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL, last_heartbeat_at timestamptz NOT NULL,
 active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0), qualified_at timestamptz
);
CREATE INDEX IF NOT EXISTS learning_read_sessions_user_article_idx ON learning_read_sessions(user_id,article_id,started_at);
CREATE TABLE IF NOT EXISTS learning_read_ticks (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES learning_read_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE, occurred_at timestamptz NOT NULL,
 seconds integer NOT NULL CHECK (seconds > 0 AND seconds <= 20)
);
CREATE INDEX IF NOT EXISTS learning_read_ticks_occurred_at_idx ON learning_read_ticks(occurred_at);
CREATE TABLE IF NOT EXISTS learning_reading_leases (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, tab_id uuid NOT NULL, article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
 last_heartbeat_at timestamptz NOT NULL, sequence integer NOT NULL, active boolean NOT NULL
);
INSERT INTO schema_migrations (name) VALUES ('0018_learning_statistics.sql') ON CONFLICT (name) DO NOTHING;
