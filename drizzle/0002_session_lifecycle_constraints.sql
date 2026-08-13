DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_expires_after_created_check'
      AND conrelid = 'sessions'::regclass
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_expires_after_created_check
      CHECK (expires_at > created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_revoked_after_created_check'
      AND conrelid = 'sessions'::regclass
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_revoked_after_created_check
      CHECK (revoked_at IS NULL OR revoked_at >= created_at);
  END IF;
END;
$$;

INSERT INTO schema_migrations (name)
VALUES ('0002_session_lifecycle_constraints.sql')
ON CONFLICT (name) DO NOTHING;
