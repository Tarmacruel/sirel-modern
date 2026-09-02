CREATE TABLE IF NOT EXISTS arquivo_index (
  id bigserial PRIMARY KEY,
  relative_path text NOT NULL UNIQUE,
  parent_path text NOT NULL DEFAULT '',
  name text NOT NULL,
  extension varchar(32) NOT NULL DEFAULT '',
  kind varchar(32) NOT NULL,
  size bigint,
  modified_at timestamptz,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arquivo_index_parent_idx ON arquivo_index(parent_path);
CREATE INDEX IF NOT EXISTS arquivo_index_kind_idx ON arquivo_index(kind);
CREATE INDEX IF NOT EXISTS arquivo_index_name_lower_idx ON arquivo_index(lower(name));

CREATE TABLE IF NOT EXISTS arquivo_favoritos (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, relative_path)
);

CREATE INDEX IF NOT EXISTS arquivo_favoritos_user_idx ON arquivo_favoritos(user_id);

CREATE TABLE IF NOT EXISTS arquivo_audit_log (
  id bigserial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  action varchar(32) NOT NULL,
  relative_path text,
  file_name text,
  file_size bigint,
  ip_address varchar(120),
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arquivo_audit_user_idx ON arquivo_audit_log(user_id);
CREATE INDEX IF NOT EXISTS arquivo_audit_action_idx ON arquivo_audit_log(action);
CREATE INDEX IF NOT EXISTS arquivo_audit_created_idx ON arquivo_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS arquivo_audit_path_idx ON arquivo_audit_log(relative_path);
