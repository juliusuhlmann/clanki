-- Clanki sync: one row per synced record (see src/protocol.ts).
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  -- Increases with every accepted change; clients pull everything after their last seq.
  seq INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
