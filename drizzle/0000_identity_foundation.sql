CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  normalized_username text NOT NULL UNIQUE,
  display_name text,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('reader', 'editor', 'administrator')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  token_digest char(64) NOT NULL UNIQUE,
  persistent boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS identity_audit_events (
  id uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  subject_user_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_identity_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'identity audit events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS identity_audit_events_append_only ON identity_audit_events;

CREATE TRIGGER identity_audit_events_append_only
BEFORE UPDATE OR DELETE ON identity_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_identity_audit_event_mutation();

INSERT INTO schema_migrations (name)
VALUES ('0000_identity_foundation.sql')
ON CONFLICT (name) DO NOTHING;
