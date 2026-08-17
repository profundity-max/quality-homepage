-- Image assets metadata (Slice 3 T5 — EDIT-05, ADR-0002 files outside DB)

CREATE TABLE IF NOT EXISTS image_assets (
  id uuid PRIMARY KEY,
  file_name text NOT NULL,
  extension text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 只允许图片扩展名
  CHECK (
    extension IN ('png', 'jpg', 'jpeg', 'gif', 'webp')
  )
);

INSERT INTO schema_migrations (name)
VALUES ('0006_image_assets.sql')
ON CONFLICT (name) DO NOTHING;
