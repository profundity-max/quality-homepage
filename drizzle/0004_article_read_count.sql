-- Content read counts (Slice 2 T5 — ART-06 阅读次数)

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (name)
VALUES ('0004_article_read_count.sql')
ON CONFLICT (name) DO NOTHING;
