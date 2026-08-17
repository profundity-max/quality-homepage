-- Template center (Slice 4 T3 — TPL-01/02/03/05/07/08)

CREATE TABLE IF NOT EXISTS template_categories (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  usage_scenario text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES template_categories(id),
  content_owner_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- TPL-07：发布必填版本号与变更说明（服务层校验）；有效版本必有版本记录
  CONSTRAINT templates_publish_required_check CHECK (
    status <> 'published'
    OR next_review_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS templates_category_id_idx ON templates(category_id);

CREATE TABLE IF NOT EXISTS template_versions (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES templates(id),
  version integer NOT NULL,
  version_label text NOT NULL,
  change_note text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  extension text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  software text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded')),
  quarantine_state text NOT NULL DEFAULT 'pending'
    CHECK (quarantine_state IN ('pending', 'passed', 'failed', 'quarantined')),
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version),
  CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS template_versions_template_id_idx
  ON template_versions(template_id);

INSERT INTO template_categories (id, stable_id, name, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'inspection-and-testing', '检验与测试', 0),
  ('00000000-0000-4000-8000-0000000000a2', 'data-analysis', '数据分析与统计', 1),
  ('00000000-0000-4000-8000-0000000000a3', 'problem-solving', '问题分析与改善', 2),
  ('00000000-0000-4000-8000-0000000000a4', 'risk-prevention', '风险评估与预防', 3),
  ('00000000-0000-4000-8000-0000000000a5', 'audit-and-system', '审核与体系管理', 4),
  ('00000000-0000-4000-8000-0000000000a6', 'supplier-quality', '供应商品质', 5),
  ('00000000-0000-4000-8000-0000000000a7', 'training-onboarding', '培训与新人', 6),
  ('00000000-0000-4000-8000-0000000000a8', 'project-management', '项目与日常管理', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (name)
VALUES ('0009_template_center.sql')
ON CONFLICT (name) DO NOTHING;
