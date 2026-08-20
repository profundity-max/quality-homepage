-- Slice 6: content audit, backups, recycle-bin timestamps, case flag (AUDIT/BKP/DEL/SEC-07)

-- 内容审计（AUDIT-01/02/03）：append-only，至少保留一年，普通后台不可修改
CREATE TABLE IF NOT EXISTS content_audit_events (
  id uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_audit_events_occurred_at_idx
  ON content_audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS content_audit_events_event_type_idx
  ON content_audit_events(event_type);
CREATE INDEX IF NOT EXISTS content_audit_events_target_idx
  ON content_audit_events(target_type, target_id);

CREATE OR REPLACE FUNCTION reject_content_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'content audit events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_audit_events_append_only ON content_audit_events;
CREATE TRIGGER content_audit_events_append_only
BEFORE UPDATE OR DELETE ON content_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_content_audit_mutation();

-- 备份记录（BKP-05）：kind daily/weekly/manual，状态与失败原因
CREATE TABLE IF NOT EXISTS backups (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly', 'manual')),
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  target text NOT NULL,
  encrypted boolean NOT NULL DEFAULT true,
  byte_size bigint NOT NULL DEFAULT 0,
  checksum text NOT NULL DEFAULT '',
  error text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS backups_started_at_idx ON backups(started_at DESC);

-- 回收站（DEL-02）：文章与模板归档时间
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- SEC-07：案例文章发布前必须确认已脱敏
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS is_case_article boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations (name)
VALUES ('0014_governance_audit_recycle.sql')
ON CONFLICT (name) DO NOTHING;
