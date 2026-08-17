-- Template download counts (Slice 4 T5 — FILE-04)

ALTER TABLE template_versions
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (name)
VALUES ('0012_template_download_count.sql')
ON CONFLICT (name) DO NOTHING;
