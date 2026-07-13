-- WIOA Participant Office Matching & Checklist System
-- PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ─────────────────────────────────────────────
-- Offices (source: your spreadsheet)
-- ─────────────────────────────────────────────
CREATE TABLE offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  phone         TEXT,
  hours         TEXT,
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  capacity      INTEGER,               -- optional: cap on assigned participants
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Participants (source: Zoho CRM sync)
-- ─────────────────────────────────────────────
CREATE TABLE participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_record_id    TEXT UNIQUE,        -- Zoho CRM record ID, if synced from Zoho (optional)
  workintexas_id    TEXT UNIQUE,        -- WorkInTexas ID, entered via the self-registration landing page
  first_name        TEXT,
  last_name         TEXT,
  phone             TEXT,
  pathway           TEXT,               -- learning track, e.g. 'Cybersecurity', 'SAP'
  sap_course        TEXT,               -- specific SAP course, only set when pathway = 'SAP'
  gender            TEXT,
  veteran_status    TEXT,
  ethnicity         TEXT,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  address           TEXT NOT NULL,
  city              TEXT,
  state             TEXT,
  zip               TEXT,
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  portal_token      TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Assignments (participant → nearest office)
-- ─────────────────────────────────────────────
CREATE TABLE assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  office_id       UUID NOT NULL REFERENCES offices(id),
  distance_miles  NUMERIC(6,2),
  assigned_at     TIMESTAMPTZ DEFAULT now(),
  notified_at     TIMESTAMPTZ,          -- set once the assignment email is sent
  UNIQUE (participant_id)               -- one active office assignment per participant
);

-- ─────────────────────────────────────────────
-- Checklist template (the master list of steps)
-- Edit this table's rows to change the checklist for everyone at once.
-- ─────────────────────────────────────────────
CREATE TABLE checklist_template (
  id            SERIAL PRIMARY KEY,
  step_key      TEXT UNIQUE NOT NULL,   -- stable machine key, e.g. 'orientation'
  step_label    TEXT NOT NULL,          -- human-readable, e.g. 'Attend orientation session'
  step_order    INTEGER NOT NULL,
  active        BOOLEAN DEFAULT TRUE
);

INSERT INTO checklist_template (step_key, step_label, step_order) VALUES
  ('office_visit',    'Visit assigned office for intake',          1),
  ('orientation',     'Attend orientation session',                2),
  ('eligibility_docs', 'Submit eligibility documents',             3),
  ('assessment',       'Complete skills assessment',               4),
  ('enrollment',        'Enroll in training program',              5),
  ('first_week',         'Attend first week of training',          6);

-- ─────────────────────────────────────────────
-- Per-participant checklist status
-- One row per participant per step.
-- ─────────────────────────────────────────────
CREATE TABLE checklist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL REFERENCES checklist_template(step_key),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
  completed_at    TIMESTAMPTZ,
  completed_by    TEXT CHECK (completed_by IN ('participant', 'staff')),
  UNIQUE (participant_id, step_key)
);

CREATE INDEX idx_checklist_items_participant ON checklist_items(participant_id);
CREATE INDEX idx_assignments_office ON assignments(office_id);
