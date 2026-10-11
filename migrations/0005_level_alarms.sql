CREATE TABLE alarm_settings (
 device_id TEXT PRIMARY KEY REFERENCES devices(id),
 revision INTEGER NOT NULL,
 rules TEXT NOT NULL
);
CREATE TABLE alarm_acknowledgements (
 device_id TEXT NOT NULL REFERENCES devices(id),
 level INTEGER NOT NULL CHECK(level IN (50,80,100)),
 episode TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','complete','rejected')),
 PRIMARY KEY(device_id,level,episode)
);
