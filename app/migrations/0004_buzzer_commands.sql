CREATE TABLE buzzer_commands (
 id TEXT PRIMARY KEY,
 device_id TEXT NOT NULL REFERENCES devices(id),
 action TEXT NOT NULL CHECK(action IN ('test','enable','disable')),
 requested_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','started','complete','rejected')),
 requested_by TEXT NOT NULL
);
CREATE INDEX buzzer_device_time ON buzzer_commands(device_id, requested_at DESC);
