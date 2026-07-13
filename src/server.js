// Minimal API for:
//  - the public landing page and registration form (served directly from this app)
//  - the participant checklist portal (no login — accessed via unique token)
//  - the staff dashboard (all participants + live progress)

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { seedChecklistForParticipant } = require('./checklistDefaults');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

// The landing page and the API now live on the same app/domain, so the
// browser calls to /register are same-origin and don't need CORS at all.
// This stays here only in case you ever embed the form on a *different*
// domain later (e.g. as an iframe elsewhere) — harmless if unused.
app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean) }));

// Serve the landing page (/) and the registration form (/wioa) directly.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/wioa', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'wioa.html'));
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const EARTH_RADIUS_MILES = 3958.8;
function toRad(deg) { return (deg * Math.PI) / 180; }
function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeOneAddress(address, city, state, zip) {
  const oneLine = [address, city, state, zip].filter(Boolean).join(', ');
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', oneLine);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;
  return { latitude: match.coordinates.y, longitude: match.coordinates.x };
}

// ── Public self-registration (the WordPress landing page calls this) ────
// POST /register
// Body: { first_name, last_name, email, phone, address, city, state, zip,
//         workintexas_id, pathway, sap_course, gender, veteran_status, ethnicity }
app.post('/register', async (req, res) => {
  const {
    first_name, last_name, email, phone, address, city, state, zip,
    workintexas_id, pathway, sap_course, gender, veteran_status, ethnicity,
  } = req.body || {};

  if (!first_name || !last_name || !email || !address || !workintexas_id) {
    return res.status(400).json({
      ok: false,
      error: 'First name, last name, email, address, and WorkInTexas ID are all required.',
    });
  }

  const full_name = `${first_name} ${last_name}`.trim();

  try {
    // 1. Save (or update, if this WorkInTexas ID already registered before) the participant.
    const upsert = await pool.query(
      `INSERT INTO participants (
         first_name, last_name, full_name, email, phone, address, city, state, zip,
         workintexas_id, pathway, sap_course, gender, veteran_status, ethnicity
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (workintexas_id)
       DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                     full_name = EXCLUDED.full_name, email = EXCLUDED.email,
                     phone = EXCLUDED.phone, address = EXCLUDED.address, city = EXCLUDED.city,
                     state = EXCLUDED.state, zip = EXCLUDED.zip, pathway = EXCLUDED.pathway,
                     sap_course = EXCLUDED.sap_course, gender = EXCLUDED.gender,
                     veteran_status = EXCLUDED.veteran_status, ethnicity = EXCLUDED.ethnicity,
                     updated_at = now()
       RETURNING id, portal_token`,
      [first_name, last_name, full_name, email, phone, address, city, state, zip,
       workintexas_id, pathway, sap_course, gender, veteran_status, ethnicity]
    );
    const participant = upsert.rows[0];

    // 2. Geocode their address right now (this one address, not a batch).
    const coords = await geocodeOneAddress(address, city, state, zip);

    if (!coords) {
      // Address didn't match — still save the participant so staff can follow up
      // manually, but don't fail the whole registration for the person submitting it.
      return res.json({
        ok: true,
        matched: false,
        message: 'Registration received. We could not automatically confirm your address — our team will follow up with your office assignment shortly.',
      });
    }

    await pool.query(
      `UPDATE participants SET latitude = $1, longitude = $2 WHERE id = $3`,
      [coords.latitude, coords.longitude, participant.id]
    );

    // 3. Find the nearest active, already-geocoded office.
    const { rows: offices } = await pool.query(
      `SELECT id, name, address, phone, hours, latitude, longitude
       FROM offices WHERE active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    if (offices.length === 0) {
      return res.json({
        ok: true,
        matched: false,
        message: 'Registration received. Office assignment is pending — our team will follow up shortly.',
      });
    }

    let nearest = null;
    let nearestDistance = Infinity;
    for (const o of offices) {
      const d = haversineMiles(coords.latitude, coords.longitude, o.latitude, o.longitude);
      if (d < nearestDistance) { nearestDistance = d; nearest = o; }
    }

    // 4. Save the assignment and seed their checklist.
    await pool.query(
      `INSERT INTO assignments (participant_id, office_id, distance_miles)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id)
       DO UPDATE SET office_id = EXCLUDED.office_id, distance_miles = EXCLUDED.distance_miles, assigned_at = now()`,
      [participant.id, nearest.id, nearestDistance.toFixed(2)]
    );
    await seedChecklistForParticipant(pool, participant.id);

    // 5. Email them immediately.
    const checklistLink = `${process.env.APP_BASE_URL}/checklist/${participant.portal_token}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Your WIOA program office assignment',
      text: `Hi ${full_name},

Thanks for registering. Your assigned WIOA office for your workshop is:

${nearest.name}
${nearest.address}
${nearest.phone ? 'Phone: ' + nearest.phone : ''}
${nearest.hours ? 'Hours: ' + nearest.hours : ''}

Track your enrollment steps here: ${checklistLink}

This link is unique to you — no login required.
`,
    });
    await pool.query(
      `UPDATE assignments SET notified_at = now() WHERE participant_id = $1`,
      [participant.id]
    );

    // 6. Tell the landing page it worked, so it can show a confirmation
    // without the person needing to wait for the email to arrive.
    res.json({
      ok: true,
      matched: true,
      office: { name: nearest.name, address: nearest.address, phone: nearest.phone, hours: nearest.hours },
      checklistLink,
    });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      // Unique constraint hit somewhere unexpected (e.g. duplicate email under a different WorkInTexas ID)
      return res.status(409).json({ ok: false, error: 'This email or WorkInTexas ID is already registered.' });
    }
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.' });
  }
});

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
