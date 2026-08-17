-- Onboarding roadmap (Slice 4 T1 — ONB-01/02/03/06)

CREATE TABLE IF NOT EXISTS onboarding_stages (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id uuid PRIMARY KEY,
  stage_id uuid NOT NULL REFERENCES onboarding_stages(id),
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  article_stable_id text,
  template_stable_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 步骤可引用一篇已发布文章或一个有效模板（ONB-03），二者至多其一
  CHECK (
    (article_stable_id IS NOT NULL)::int + (template_stable_id IS NOT NULL)::int <= 1
  )
);

CREATE INDEX IF NOT EXISTS onboarding_steps_stage_id_idx
  ON onboarding_steps(stage_id);

INSERT INTO onboarding_stages (id, stable_id, name, sort_order, description) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'first-day', '入职第一天', 0,
   '了解部门、岗位与工作环境。'),
  ('00000000-0000-4000-8000-0000000000a2', 'understand-quality-work', '认识品质工作', 1,
   '品质部的职责与日常工作。'),
  ('00000000-0000-4000-8000-0000000000a3', 'work-principles', '工作理念', 2,
   'Reality > Opinion、Ownership > Explanation、Early Exposure > Late Fix、System > Hero。'),
  ('00000000-0000-4000-8000-0000000000a4', 'quality-basics', '品质基础', 3,
   '品质专业基础概念与工具。'),
  ('00000000-0000-4000-8000-0000000000a5', 'thermal-and-tvc', '散热与 TVC 入门', 4,
   '散热技术与 Thin Vapor Chamber 入门。'),
  ('00000000-0000-4000-8000-0000000000a6', 'training-and-probation', '培训与试用期', 5,
   '试用期培训安排与考核路径。')
ON CONFLICT (id) DO NOTHING;

INSERT INTO onboarding_steps (id, stage_id, sort_order, title, description) VALUES
  ('00000000-0000-4000-8000-0000000000b1',
   '00000000-0000-4000-8000-0000000000a1', 0, '认识团队与工位', '介绍团队成员与工位安排。'),
  ('00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-0000000000a2', 0, '品质部职责概览', '了解品质部在组织中的角色。'),
  ('00000000-0000-4000-8000-0000000000b3',
   '00000000-0000-4000-8000-0000000000a3', 0, '四项工作理念', 'Reality > Opinion、Ownership > Explanation、Early Exposure > Late Fix、System > Hero。'),
  ('00000000-0000-4000-8000-0000000000b4',
   '00000000-0000-4000-8000-0000000000a4', 0, '品质基础概念', '了解 SPC、MSA 等基础工具。'),
  ('00000000-0000-4000-8000-0000000000b5',
   '00000000-0000-4000-8000-0000000000a5', 0, 'TVC 技术入门', 'Thin Vapor Chamber 基本工作原理。'),
  ('00000000-0000-4000-8000-0000000000b6',
   '00000000-0000-4000-8000-0000000000a6', 0, '试用期计划', '试用期各阶段的目标与检查点。')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (name)
VALUES ('0008_onboarding.sql')
ON CONFLICT (name) DO NOTHING;
