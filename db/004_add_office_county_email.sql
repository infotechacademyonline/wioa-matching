-- Run this in the Neon SQL Editor before importing the office list.

ALTER TABLE offices ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE offices ADD COLUMN IF NOT EXISTS email TEXT;
