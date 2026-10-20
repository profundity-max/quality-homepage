CREATE UNIQUE INDEX IF NOT EXISTS template_versions_one_active_idx ON template_versions(template_id) WHERE status = 'active';

INSERT INTO schema_migrations (name) VALUES ('0017_single_active_template_version.sql') ON CONFLICT (name) DO NOTHING;
