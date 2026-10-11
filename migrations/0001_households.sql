PRAGMA foreign_keys = ON;
CREATE TABLE households (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tank_name TEXT NOT NULL,
  preferences TEXT NOT NULL DEFAULT '{"low":true,"full":false,"fault":true,"offline":true}'
);
CREATE TABLE memberships (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  subject TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','operator','viewer')),
  UNIQUE(household_id, subject)
);
CREATE INDEX memberships_household ON memberships(household_id);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('viewer','operator')),
  token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX invitations_household ON invitations(household_id, expires_at);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX audit_household_time ON audit_events(household_id, at DESC);
-- Owners are explicitly provisioned with their verified Auth0 subject; no public owner signup.
-- Telemetry, device enrollment and actuator delivery are a subsequent milestone.
