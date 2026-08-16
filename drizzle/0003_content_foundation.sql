-- Content foundation: sections, topics, topic_aliases, articles
-- Slice 2 T1 — initial column tree from 栏目体系.md (IA-04/IA-05)

CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES sections(id),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sections_parent_id_idx ON sections(parent_id);

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  section_id uuid NOT NULL REFERENCES sections(id),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topics_section_id_idx ON topics(section_id);

CREATE TABLE IF NOT EXISTS topic_aliases (
  id uuid PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES topics(id),
  alias text NOT NULL,
  UNIQUE (topic_id, alias)
);

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  primary_topic_id uuid NOT NULL REFERENCES topics(id),
  tags text[] NOT NULL DEFAULT '{}',
  content_owner_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- ART-04: title, summary, body, primary topic, content owner and review
  -- date are publish-required
  CONSTRAINT articles_publish_required_check CHECK (
    status <> 'published'
    OR (
      btrim(title) <> ''
      AND btrim(summary) <> ''
      AND btrim(body_markdown) <> ''
      AND content_owner_id IS NOT NULL
      AND next_review_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS articles_primary_topic_id_idx
  ON articles(primary_topic_id);

CREATE TABLE IF NOT EXISTS article_aliases (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id),
  alias text NOT NULL,
  UNIQUE (article_id, alias)
);

CREATE INDEX IF NOT EXISTS article_aliases_article_id_idx
  ON article_aliases(article_id);

-- ---------------------------------------------------------------------------
-- Initial column tree (栏目体系.md)
-- ---------------------------------------------------------------------------

INSERT INTO sections (id, stable_id, name, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'quality-knowledge', '品质知识', 0),
  ('00000000-0000-4000-8000-0000000000a2', 'thermal-knowledge', '散热知识', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sections (id, stable_id, name, parent_id, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'data-and-statistics',
   '数据与统计基础', '00000000-0000-4000-8000-0000000000a1', 0),
  ('00000000-0000-4000-8000-0000000000b2', 'measurement-and-data-credibility',
   '测量与数据可信度', '00000000-0000-4000-8000-0000000000a1', 1),
  ('00000000-0000-4000-8000-0000000000b3', 'process-control',
   '过程控制', '00000000-0000-4000-8000-0000000000a1', 2),
  ('00000000-0000-4000-8000-0000000000b4', 'problem-solving',
   '问题解决', '00000000-0000-4000-8000-0000000000a1', 3),
  ('00000000-0000-4000-8000-0000000000b5', 'risk-and-prevention',
   '风险与预防', '00000000-0000-4000-8000-0000000000a1', 4),
  ('00000000-0000-4000-8000-0000000000b6', 'quality-system-and-management',
   '品质系统与管理', '00000000-0000-4000-8000-0000000000a1', 5),
  ('00000000-0000-4000-8000-0000000000b7', 'thermal-principles',
   '原理知识', '00000000-0000-4000-8000-0000000000a2', 0),
  ('00000000-0000-4000-8000-0000000000b8', 'thermal-process',
   '工艺知识', '00000000-0000-4000-8000-0000000000a2', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO topics (id, stable_id, section_id, name, sort_order) VALUES
  -- 数据与统计基础
  ('00000000-0000-4000-8000-000000000c01', 'mean-sigma-distribution-ci-normal-distribution',
   '00000000-0000-4000-8000-0000000000b1', 'Mean / σ / Distribution / CI / 正态分布', 0),
  ('00000000-0000-4000-8000-000000000c02', 'sampling-and-sampling-risk',
   '00000000-0000-4000-8000-0000000000b1', '抽样与抽样风险', 1),
  ('00000000-0000-4000-8000-000000000c03', 'hypothesis-test',
   '00000000-0000-4000-8000-0000000000b1', 'Hypothesis Test 假设检验', 2),
  ('00000000-0000-4000-8000-000000000c04', 'anova',
   '00000000-0000-4000-8000-0000000000b1', 'ANOVA', 3),
  ('00000000-0000-4000-8000-000000000c05', 'correlation-vs-causation',
   '00000000-0000-4000-8000-0000000000b1', 'Correlation vs Causation', 4),
  ('00000000-0000-4000-8000-000000000c06', 'regression',
   '00000000-0000-4000-8000-0000000000b1', 'Regression', 5),
  -- 测量与数据可信度
  ('00000000-0000-4000-8000-000000000c07', 'msa',
   '00000000-0000-4000-8000-0000000000b2', 'MSA', 0),
  ('00000000-0000-4000-8000-000000000c08', 'bias-linearity-stability',
   '00000000-0000-4000-8000-0000000000b2', 'Bias / Linearity / Stability', 1),
  ('00000000-0000-4000-8000-000000000c09', 'attribute-agreement-analysis',
   '00000000-0000-4000-8000-0000000000b2', 'Attribute Agreement Analysis', 2),
  ('00000000-0000-4000-8000-000000000c10', 'measurement-uncertainty',
   '00000000-0000-4000-8000-0000000000b2', 'Measurement Uncertainty', 3),
  ('00000000-0000-4000-8000-000000000c11', 'calibration',
   '00000000-0000-4000-8000-0000000000b2', 'Calibration', 4),
  -- 过程控制
  ('00000000-0000-4000-8000-000000000c12', 'spc',
   '00000000-0000-4000-8000-0000000000b3', 'SPC', 0),
  ('00000000-0000-4000-8000-000000000c13', 'control-chart',
   '00000000-0000-4000-8000-0000000000b3', 'Control Chart', 1),
  ('00000000-0000-4000-8000-000000000c14', 'xbar-r',
   '00000000-0000-4000-8000-0000000000b3', 'Xbar-R', 2),
  ('00000000-0000-4000-8000-000000000c15', 'common-cause-vs-special-cause',
   '00000000-0000-4000-8000-0000000000b3', 'Common Cause vs Special Cause', 3),
  ('00000000-0000-4000-8000-000000000c16', 'cp-cpk',
   '00000000-0000-4000-8000-0000000000b3', 'Cp / Cpk', 4),
  ('00000000-0000-4000-8000-000000000c17', 'pp-ppk',
   '00000000-0000-4000-8000-0000000000b3', 'Pp / Ppk', 5),
  ('00000000-0000-4000-8000-000000000c18', 'ocap',
   '00000000-0000-4000-8000-0000000000b3', 'OCAP', 6),
  -- 问题解决
  ('00000000-0000-4000-8000-000000000c19', 'rca',
   '00000000-0000-4000-8000-0000000000b4', 'RCA', 0),
  ('00000000-0000-4000-8000-000000000c20', 'capa',
   '00000000-0000-4000-8000-0000000000b4', 'CAPA', 1),
  ('00000000-0000-4000-8000-000000000c21', 'verification-validation',
   '00000000-0000-4000-8000-0000000000b4', 'Verification / Validation', 2),
  ('00000000-0000-4000-8000-000000000c22', 'escape-point-analysis',
   '00000000-0000-4000-8000-0000000000b4', 'Escape Point Analysis', 3),
  -- 风险与预防
  ('00000000-0000-4000-8000-000000000c23', 'dfmea-pfmea',
   '00000000-0000-4000-8000-0000000000b5', 'DFMEA / PFMEA', 0),
  ('00000000-0000-4000-8000-000000000c24', 'control-plan',
   '00000000-0000-4000-8000-0000000000b5', 'Control Plan', 1),
  ('00000000-0000-4000-8000-000000000c25', 'ctq',
   '00000000-0000-4000-8000-0000000000b5', 'CTQ', 2),
  ('00000000-0000-4000-8000-000000000c26', 'error-proofing-poka-yoke',
   '00000000-0000-4000-8000-0000000000b5', 'Error Proofing / Poka-Yoke', 3),
  ('00000000-0000-4000-8000-000000000c27', 'change-management',
   '00000000-0000-4000-8000-0000000000b5', 'Change Management', 4),
  ('00000000-0000-4000-8000-000000000c28', 'lessons-learned-horizontal-deployment',
   '00000000-0000-4000-8000-0000000000b5', 'Lessons Learned / Horizontal Deployment', 5),
  -- 品质系统与管理
  ('00000000-0000-4000-8000-000000000c29', 'qms',
   '00000000-0000-4000-8000-0000000000b6', 'QMS', 0),
  ('00000000-0000-4000-8000-000000000c30', 'audit',
   '00000000-0000-4000-8000-0000000000b6', 'Audit', 1),
  ('00000000-0000-4000-8000-000000000c31', 'document-control',
   '00000000-0000-4000-8000-0000000000b6', 'Document Control', 2),
  ('00000000-0000-4000-8000-000000000c32', 'traceability',
   '00000000-0000-4000-8000-0000000000b6', 'Traceability', 3),
  ('00000000-0000-4000-8000-000000000c33', 'supplier-quality',
   '00000000-0000-4000-8000-0000000000b6', 'Supplier Quality', 4),
  ('00000000-0000-4000-8000-000000000c34', 'incoming-process-outgoing-quality',
   '00000000-0000-4000-8000-0000000000b6', 'Incoming / Process / Outgoing Quality', 5),
  ('00000000-0000-4000-8000-000000000c35', 'reliability',
   '00000000-0000-4000-8000-0000000000b6', 'Reliability', 6),
  ('00000000-0000-4000-8000-000000000c36', 'quality-cost-copq',
   '00000000-0000-4000-8000-0000000000b6', 'Quality Cost / COPQ', 7),
  ('00000000-0000-4000-8000-000000000c37', 'quality-kpi',
   '00000000-0000-4000-8000-0000000000b6', 'Quality KPI', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO topic_aliases (id, topic_id, alias) VALUES
  ('00000000-0000-4000-8000-000000000a01',
   '00000000-0000-4000-8000-000000000c01', 'σ'),
  ('00000000-0000-4000-8000-000000000a02',
   '00000000-0000-4000-8000-000000000c01', 'Sigma'),
  ('00000000-0000-4000-8000-000000000a03',
   '00000000-0000-4000-8000-000000000c01', '标准差'),
  ('00000000-0000-4000-8000-000000000a04',
   '00000000-0000-4000-8000-000000000c04', '方差分析'),
  ('00000000-0000-4000-8000-000000000a05',
   '00000000-0000-4000-8000-000000000c07', '测量系统分析'),
  ('00000000-0000-4000-8000-000000000a06',
   '00000000-0000-4000-8000-000000000c12', '统计过程控制'),
  ('00000000-0000-4000-8000-000000000a07',
   '00000000-0000-4000-8000-000000000c13', '控制图'),
  ('00000000-0000-4000-8000-000000000a08',
   '00000000-0000-4000-8000-000000000c14', '均值极差图'),
  ('00000000-0000-4000-8000-000000000a09',
   '00000000-0000-4000-8000-000000000c16', '过程能力'),
  ('00000000-0000-4000-8000-000000000a10',
   '00000000-0000-4000-8000-000000000c19', '根本原因分析'),
  ('00000000-0000-4000-8000-000000000a11',
   '00000000-0000-4000-8000-000000000c20', '纠正与预防措施'),
  ('00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-000000000c29', '质量管理体系')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (name)
VALUES ('0003_content_foundation.sql')
ON CONFLICT (name) DO NOTHING;
