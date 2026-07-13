-- Run this in the Neon SQL Editor after 002_add_workintexas_id.sql.
-- Adds the additional intake fields to match your existing /wioa/ application form.

ALTER TABLE participants ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS pathway TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS sap_course TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS veteran_status TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS ethnicity TEXT;
