-- Template quarantine reason (Slice 4 T4 — FILE-02)

ALTER TABLE template_versions
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

INSERT INTO schema_migrations (name)
VALUES ('0011_template_quarantine_reason.sql')
ON CONFLICT (name) DO NOTHING;
