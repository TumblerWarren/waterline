CREATE TABLE push_installations (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL REFERENCES memberships(subject) ON DELETE CASCADE,
 token TEXT NOT NULL UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE push_deliveries (
 installation_id TEXT NOT NULL REFERENCES push_installations(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 level INTEGER NOT NULL CHECK(level IN (20,50,80,100)),
 episode TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,device_id,level,episode)
);
CREATE INDEX push_due ON push_deliveries(status,next_at);
