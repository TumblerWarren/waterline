-- Initial household defaults requested by the owner. Preserve any app-saved settings.
INSERT INTO alarm_settings(device_id,revision,rules)
SELECT id,1,'[{"level":20,"enabled":true,"onSeconds":60,"offSeconds":540},{"level":50,"enabled":true,"onSeconds":10,"offSeconds":50},{"level":80,"enabled":true,"onSeconds":10,"offSeconds":50},{"level":100,"enabled":true,"onSeconds":10,"offSeconds":50}]'
FROM devices WHERE id='rooftop-esp32' AND household_id='home' AND enabled=1
ON CONFLICT(device_id) DO NOTHING;
