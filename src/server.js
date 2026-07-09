// Minimal API for:
//  - the participant checklist portal (no login — accessed via unique token)
//  - the staff dashboard (all participants + live progress)
//
// This is intentionally framework-light so you can drop your own React/HTML
// front end on top of these JSON endpoints, or render server-side with EJS —
// whichever matches how the rest of ApexLearn/Upspace is built.

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

// ── Participant portal ──────────────────────────────────────────────
// GET /checklist/:token -> participant info + their checklist with status
app.get('/checklist/:token', async (req, res) => {
  const { token } = req.params;

  const participant = await pool.query(
    `SELECT id, full_name, email FROM participants WHERE portal_token = $1`,
    [token]
  );
  if (participant.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const p = participant.rows[0];

  const office = await pool.query(
    `SELECT o.name, o.address, o.phone, o.hours
     FROM assignments a JOIN offices o ON o.id = a.office_id
     WHERE a.participant_id = $1`,
    [p.id]
  );

  const checklist = await pool.query(
    `SELECT t.step_key, t.step_label, t.step_order, c.status, c.completed_at
     FROM checklist_items c
     JOIN checklist_template t ON t.step_key = c.step_key
     WHERE c.participant_id = $1
     ORDER BY t.step_order`,
    [p.id]
  );

  res.json({
    participant: { name: p.full_name, email: p.email },
    office: office.rows[0] || null,
    checklist: checklist.rows,
  });
});

// POST /checklist/:token/:stepKey/complete -> participant marks a step done
app.post('/checklist/:token/:stepKey/complete', async (req, res) => {
  const { token, stepKey } = req.params;

  const participant = await pool.query(
    `SELECT id FROM participants WHERE portal_token = $1`,
    [token]
  );
  if (participant.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  await pool.query(
    `UPDATE checklist_items
     SET status = 'complete', completed_at = now(), completed_by = 'participant'
     WHERE participant_id = $1 AND step_key = $2`,
    [participant.rows[0].id, stepKey]
  );

  res.json({ ok: true });
});

// ── Staff dashboard ──────────────────────────────────────────────────
// Simple shared-password check for now — swap for real auth (your existing
// staff login) before this goes anywhere near production.
function requireStaffAuth(req, res, next) {
  if (req.headers['x-staff-password'] !== process.env.STAFF_DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /staff/participants -> every participant, their office, and % checklist complete
app.get('/staff/participants', requireStaffAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.full_name, p.email,
      o.name AS office_name,
      a.distance_miles,
      COUNT(c.*) FILTER (WHERE c.status = 'complete') AS steps_complete,
      COUNT(c.*) AS steps_total
    FROM participants p
    LEFT JOIN assignments a ON a.participant_id = p.id
    LEFT JOIN offices o ON o.id = a.office_id
    LEFT JOIN checklist_items c ON c.participant_id = p.id
    GROUP BY p.id, o.name, a.distance_miles
    ORDER BY p.full_name
  `);
  res.json(rows);
});

// POST /staff/participants/:id/:stepKey/complete -> staff marks a step done
// (e.g. after verifying a document in person)
app.post('/staff/participants/:id/:stepKey/complete', requireStaffAuth, async (req, res) => {
  const { id, stepKey } = req.params;

  await pool.query(
    `UPDATE checklist_items
     SET status = 'complete', completed_at = now(), completed_by = 'staff'
     WHERE participant_id = $1 AND step_key = $2`,
    [id, stepKey]
  );

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
