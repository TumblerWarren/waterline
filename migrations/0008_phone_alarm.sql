ALTER TABLE push_installations ADD COLUMN alarm_capable INTEGER NOT NULL DEFAULT 0;
CREATE INDEX push_subject ON push_installations(subject,enabled);
CREATE TABLE push_stops (
 installation_id TEXT NOT NULL REFERENCES push_installations(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 level INTEGER NOT NULL,
 episode TEXT NOT NULL,
 next_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(installation_id,device_id,level,episode)
);
CREATE INDEX push_stops_due ON push_stops(next_at);

CREATE INDEX push_device_episode ON push_deliveries(device_id,level,episode);
CREATE INDEX ack_expiry ON alarm_acknowledgements(expires_at);
