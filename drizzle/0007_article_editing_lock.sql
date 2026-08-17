-- Editing occupancy (Slice 3 T7 — EDIT-09)

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS editing_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS editing_at timestamptz;

CREATE INDEX IF NOT EXISTS articles_editing_by_idx ON articles(editing_by);

INSERT INTO schema_migrations (name)
VALUES ('0007_article_editing_lock.sql')
ON CONFLICT (name) DO NOTHING;
