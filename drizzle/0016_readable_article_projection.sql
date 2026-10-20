-- Preserve every reader-visible field before changing the working copy.
ALTER TABLE article_versions ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE article_versions ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS published_updated_at timestamptz;
UPDATE articles SET published_updated_at = updated_at WHERE status = 'published' AND published_updated_at IS NULL;

-- Old snapshots have no historical aliases: fail closed rather than expose draft aliases.
CREATE OR REPLACE VIEW readable_articles AS
SELECT a.id, a.stable_id, a.title, a.summary, a.body_markdown,
       a.primary_topic_id, a.tags, a.content_owner_id, a.last_reviewed_at,
       a.next_review_at, a.published_at, a.read_count, coalesce(a.published_updated_at, a.updated_at) AS updated_at,
       'published'::text AS status, false AS editing_in_progress,
       ARRAY(SELECT alias FROM article_aliases WHERE article_id = a.id ORDER BY alias) AS aliases
FROM articles a WHERE a.status = 'published'
UNION ALL
SELECT a.id, a.stable_id, v.title, v.summary, v.body_markdown,
       v.primary_topic_id, v.tags, v.content_owner_id, v.last_reviewed_at,
       v.next_review_at, a.published_at, a.read_count,
       coalesce(v.source_updated_at, v.created_at) AS updated_at,
       'published'::text AS status, true AS editing_in_progress, v.aliases
FROM articles a
JOIN LATERAL (
  SELECT * FROM article_versions
  WHERE article_id = a.id AND kind = 'publish'
  ORDER BY version DESC LIMIT 1
) v ON true
WHERE a.status = 'draft' AND a.published_at IS NOT NULL;

INSERT INTO schema_migrations (name) VALUES ('0016_readable_article_projection.sql') ON CONFLICT (name) DO NOTHING;
