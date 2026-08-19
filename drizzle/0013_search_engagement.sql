-- Slice 5: search, favorites, feedback and content statistics (SEARCH/FAV/FDBK/STAT)

-- 收藏（FAV-01）：阅读者收藏已发布文章，收藏仅本人可见
CREATE TABLE IF NOT EXISTS article_favorites (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS article_favorites_article_user_idx
  ON article_favorites(article_id, user_id);
CREATE INDEX IF NOT EXISTS article_favorites_user_idx
  ON article_favorites(user_id);

-- 内容反馈（FDBK-01/02/03）：五类反馈，状态待处理/已解决/忽略
CREATE TABLE IF NOT EXISTS content_feedback (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id),
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  feedback_type text NOT NULL
    CHECK (feedback_type IN ('error', 'outdated', 'unclear', 'missing', 'other')),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'ignored')),
  handled_by uuid REFERENCES users(id),
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_feedback_status_idx
  ON content_feedback(status);
CREATE INDEX IF NOT EXISTS content_feedback_article_idx
  ON content_feedback(article_id);

-- 搜索记录（STAT-09/SEARCH-07）：搜索词、搜索者、时间、是否有结果、知识缺口说明
CREATE TABLE IF NOT EXISTS search_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  query text NOT NULL CHECK (length(btrim(query)) > 0),
  has_results boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS search_events_created_at_idx
  ON search_events(created_at);
CREATE INDEX IF NOT EXISTS search_events_user_created_at_idx
  ON search_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS search_events_has_results_idx
  ON search_events(has_results);

-- 匿名长期聚合（STAT-08）：90 天明细清理后仍保留知识缺口统计
CREATE TABLE IF NOT EXISTS search_aggregates (
  query text PRIMARY KEY,
  has_results boolean NOT NULL,
  search_count integer NOT NULL DEFAULT 1 CHECK (search_count >= 0),
  last_searched_at timestamptz NOT NULL
);

-- 阅读明细（STAT-01/03）：30 分钟去重与触达人数统计
CREATE TABLE IF NOT EXISTS article_read_events (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id),
  user_id uuid NOT NULL REFERENCES users(id),
  read_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS article_read_events_dedup_idx
  ON article_read_events(user_id, article_id, read_at);
CREATE INDEX IF NOT EXISTS article_read_events_article_idx
  ON article_read_events(article_id);
CREATE INDEX IF NOT EXISTS article_read_events_read_at_idx
  ON article_read_events(read_at);

-- 按日去重的匿名聚合（STAT-08）：清理明细前快照，长期保留
CREATE TABLE IF NOT EXISTS article_daily_reach (
  article_id uuid NOT NULL REFERENCES articles(id),
  read_day date NOT NULL,
  reach_count integer NOT NULL DEFAULT 0 CHECK (reach_count >= 0),
  PRIMARY KEY (article_id, read_day)
);

-- 模板下载明细（FILE-04/STAT-04）：下载人数统计
CREATE TABLE IF NOT EXISTS template_download_events (
  id uuid PRIMARY KEY,
  template_version_id uuid NOT NULL REFERENCES template_versions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  downloaded_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS template_download_events_version_idx
  ON template_download_events(template_version_id);
CREATE INDEX IF NOT EXISTS template_download_events_user_idx
  ON template_download_events(user_id);

INSERT INTO schema_migrations (name)
VALUES ('0013_search_engagement.sql')
ON CONFLICT (name) DO NOTHING;
