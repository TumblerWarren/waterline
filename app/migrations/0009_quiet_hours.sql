ALTER TABLE push_installations ADD COLUMN quiet_hours TEXT;
ALTER TABLE push_installations ADD COLUMN quiet_resume_at INTEGER;
CREATE INDEX push_quiet_due ON push_installations(quiet_resume_at);
