CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  actor TEXT NOT NULL,
  happened_at TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);
CREATE INDEX IF NOT EXISTS audit_scope_revision ON audit_log(scope, revision DESC);
CREATE TABLE IF NOT EXISTS calendar_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  encrypted_tokens TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_events (
  period_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  etag TEXT,
  body TEXT NOT NULL,
  PRIMARY KEY (period_id, slot_key)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
