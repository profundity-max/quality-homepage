-- Keep legacy stage/step tables intact for migration verification.
CREATE TABLE IF NOT EXISTS onboarding_route_items (
  id uuid PRIMARY KEY,
  article_id uuid NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  legacy_stage_stable_id text UNIQUE
);

DO $$
DECLARE
  route_topic_id uuid;
  stage_row record;
  step_row record;
  new_article_id uuid;
  article_body text;
  migration_owner_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0015_article_based_onboarding.sql') THEN
    -- Existing installations retain public content under a real content steward.
    -- Fresh installations without accounts receive drafts for their first editor.
    SELECT id INTO migration_owner_id FROM users
    WHERE disabled_at IS NULL AND role IN ('administrator', 'editor')
    ORDER BY CASE WHEN role = 'administrator' THEN 0 ELSE 1 END, created_at, id LIMIT 1;
    INSERT INTO sections (id, stable_id, name, sort_order, created_at)
    VALUES (gen_random_uuid(), 'onboarding-route-content', '新人学习', 2, now())
    ON CONFLICT (stable_id) DO NOTHING;
    INSERT INTO topics (id, stable_id, section_id, name, sort_order, created_at)
    SELECT gen_random_uuid(), 'onboarding-route-articles', id, '入门指南', 0, now()
    FROM sections WHERE stable_id = 'onboarding-route-content'
    ON CONFLICT (stable_id) DO NOTHING;
    SELECT id INTO route_topic_id FROM topics WHERE stable_id = 'onboarding-route-articles';

    FOR stage_row IN SELECT * FROM onboarding_stages ORDER BY sort_order, id LOOP
      new_article_id := gen_random_uuid();
      article_body := stage_row.description;
      FOR step_row IN SELECT * FROM onboarding_steps WHERE stage_id = stage_row.id ORDER BY sort_order, id LOOP
        article_body := article_body || E'\n\n## ' || step_row.title || E'\n\n' || step_row.description;
        IF step_row.article_stable_id IS NOT NULL THEN
          article_body := article_body || E'\n\n[阅读相关文章](</articles/' || step_row.article_stable_id || '>)';
        END IF;
        IF step_row.template_stable_id IS NOT NULL THEN
          article_body := article_body || E'\n\n[查看相关模板](</templates/' || step_row.template_stable_id || '>)';
        END IF;
      END LOOP;
      INSERT INTO articles (id, stable_id, title, summary, body_markdown, primary_topic_id,
        tags, status, content_owner_id, next_review_at, published_at, updated_at, created_at)
      VALUES (new_article_id, 'onboarding-' || stage_row.id, stage_row.name,
        coalesce(nullif(btrim(stage_row.description), ''), stage_row.name),
        coalesce(nullif(btrim(article_body), ''), stage_row.name), route_topic_id, ARRAY[]::text[],
        CASE WHEN migration_owner_id IS NULL THEN 'draft' ELSE 'published' END,
        migration_owner_id, now(), CASE WHEN migration_owner_id IS NOT NULL THEN now() END,
        stage_row.created_at, stage_row.created_at);
      INSERT INTO onboarding_route_items (id, article_id, sort_order, legacy_stage_stable_id)
      VALUES (gen_random_uuid(), new_article_id, stage_row.sort_order, stage_row.stable_id);
    END LOOP;
    INSERT INTO schema_migrations (name) VALUES ('0015_article_based_onboarding.sql');
  END IF;
END $$;
