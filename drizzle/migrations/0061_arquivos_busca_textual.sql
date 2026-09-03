ALTER TABLE arquivo_index
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS content_indexed_at timestamptz;

CREATE INDEX IF NOT EXISTS arquivo_index_content_search_idx
  ON arquivo_index
  USING gin (to_tsvector('simple', coalesce(content_text, '')));
