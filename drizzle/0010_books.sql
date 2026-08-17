-- Recommended books (Slice 4 T7 — BOOK-01/02/03/04)

CREATE TABLE IF NOT EXISTS book_categories (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY,
  stable_id text NOT NULL UNIQUE,
  title text NOT NULL,
  author text NOT NULL,
  cover_image_id uuid,
  cover_extension text,
  recommendation text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES book_categories(id),
  tags text[] NOT NULL DEFAULT '{}',
  recommended_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 封面可选；有封面时扩展名必须是受控图片类型（BOOK-04）
  CHECK (
    (cover_image_id IS NULL AND cover_extension IS NULL)
    OR cover_extension IN ('png', 'jpg', 'jpeg', 'gif', 'webp')
  )
);

CREATE INDEX IF NOT EXISTS books_category_id_idx ON books(category_id);

INSERT INTO book_categories (id, stable_id, name, sort_order) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'quality-professional', '品质专业', 0),
  ('00000000-0000-4000-8000-0000000000a2', 'statistics-data', '统计与数据', 1),
  ('00000000-0000-4000-8000-0000000000a3', 'engineering-technology', '工程技术', 2),
  ('00000000-0000-4000-8000-0000000000a4', 'management-communication', '管理与沟通', 3),
  ('00000000-0000-4000-8000-0000000000a5', 'personal-growth', '个人成长', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (name)
VALUES ('0010_books.sql')
ON CONFLICT (name) DO NOTHING;
