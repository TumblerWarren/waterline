CREATE TABLE alarm_acknowledgements_v2 (
 device_id TEXT NOT NULL REFERENCES devices(id),
 level INTEGER NOT NULL CHECK(level IN (20,50,80,100)),
 episode TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','complete','rejected')),
 PRIMARY KEY(device_id,level,episode)
);
INSERT INTO alarm_acknowledgements_v2 SELECT * FROM alarm_acknowledgements;
DROP TABLE alarm_acknowledgements;
ALTER TABLE alarm_acknowledgements_v2 RENAME TO alarm_acknowledgements;
UPDATE alarm_settings
SET rules=json_insert(rules,'$[#]',json('{"level":20,"enabled":true,"onSeconds":60,"offSeconds":540}')),revision=revision+1
WHERE NOT EXISTS (SELECT 1 FROM json_each(alarm_settings.rules) WHERE json_extract(value,'$.level')=20);
