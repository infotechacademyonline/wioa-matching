-- Run this AFTER schema.sql if you already created your database.
-- Adds the field the new self-registration landing page needs.

ALTER TABLE participants ADD COLUMN IF NOT EXISTS workintexas_id TEXT UNIQUE;
