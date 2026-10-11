CREATE TABLE calibration_commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  mode TEXT NOT NULL CHECK(mode IN ('dry','wet')),
  requested_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','started','complete','rejected')),
  requested_by TEXT NOT NULL
);
CREATE INDEX calibration_device_time ON calibration_commands(device_id, requested_at DESC);
