-- Article versions and editing foundation (Slice 3 T1 — VER-01/02/03 data layer)

CREATE TABLE IF NOT EXISTS article_versions (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id),
  version integer NOT NULL,
  kind text NOT NULL DEFAULT 'publish'
    CHECK (kind IN ('publish', 'restore')),
  title text NOT NULL,
  summary text NOT NULL,
  body_markdown text NOT NULL,
  primary_topic_id uuid NOT NULL REFERENCES topics(id),
  tags text[] NOT NULL DEFAULT '{}',
  content_owner_id uuid REFERENCES users(id),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  restored_reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 版本号在文章内递增唯一
  UNIQUE (article_id, version),
  -- 版本号必须为正整数
  CHECK (version > 0),
  -- VER-03：恢复操作必须填写原因；正常发布（VER-02）无原因。
  -- kind 区分两类行，使该约束可结构化强制而非仅靠应用纪律。
  CHECK (
    (kind = 'restore') = (restored_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS article_versions_article_id_idx
  ON article_versions(article_id);

INSERT INTO schema_migrations (name)
VALUES ('0005_article_versions.sql')
ON CONFLICT (name) DO NOTHING;
