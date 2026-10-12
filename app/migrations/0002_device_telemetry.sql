CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  last_seen INTEGER,
  latest TEXT
);
CREATE TABLE telemetry (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  band TEXT NOT NULL,
  PRIMARY KEY(device_id, sample_id)
);
CREATE INDEX telemetry_time ON telemetry(device_id, received_at);
