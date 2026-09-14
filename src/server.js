// This app serves three kinds of things, all from one process:
//  1. Public pages: landing page (/), registration form (/wioa)
//  2. Participant-facing pages: the checklist portal (/checklist/:token)
//  3. Staff-facing pages: the dashboard (/staff)
// Each HTML page above talks to a matching JSON API under /api/... to
// load and update its data.

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { seedChecklistForParticipant } = require('./checklistDefaults');
const { sendParticipantAssignment, sendStaffRegistrationNotice } = require('./mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Neon (and most hosted Postgres) drops idle connections. pg reports that as
// an 'error' event on the pool; with no listener, Node treats it as an
// uncaught exception and the whole server exits. Log it — the pool replaces
// the dead client on the next query.
pool.on('error', (err) => {
  console.error('Idle Postgres client error:', err.message);
});

// Express 4 doesn't catch rejected promises from async handlers — the request
// hangs and, on Node 15+, the unhandled rejection kills the process. Wrapping
// each async route forwards any error to the error middleware at the bottom.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.use(express.json());
app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean) }));

const EARTH_RADIUS_MILES = 3958.8;
function toRad(deg) { return (deg * Math.PI) / 180; }
function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOCODE_TIMEOUT_MS = 8000;

// Returns { latitude, longitude }, or null if the address couldn't be matched
// OR the Census API is slow/down/returning garbage. Callers treat null as
// "needs manual follow-up", so a geocoder outage never fails a registration.
async function geocodeOneAddress(address, city, state, zip) {
  const oneLine = [address, city, state, zip].filter(Boolean).join(', ');
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', oneLine);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return null;
    return { latitude: match.coordinates.y, longitude: match.coordinates.x };
  } catch (err) {
    console.error(`Geocoding failed for "${oneLine}":`, err.message);
    return null;
  }
}

// ── Public self-registration ─────────────────────────────────────────
// POST /api/register
app.post('/api/register', asyncHandler(async (req, res) => {
  const {
    first_name, last_name, email, phone, address, city, state, zip,
    workintexas_id, ssn, pathway, sap_course, gender, veteran_status, ethnicity,
  } = req.body || {};

  // Server-side required-field check. The form enforces these too, but
  // don't trust the browser — a curl or a broken JS build would bypass it.
  const missing = [];
  if (!first_name)     missing.push('First name');
  if (!last_name)      missing.push('Last name');
  if (!email)          missing.push('Email');
  if (!address)        missing.push('Address');
  if (!workintexas_id) missing.push('WorkInTexas ID');
  if (!ssn)            missing.push('Social Security Number');
  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
    });
  }

  // Normalise SSN to "123-45-6789" form regardless of what the user typed.
  // Store consistently so staff-side searches and dedupe work later.
  const digits = String(ssn).replace(/\D/g, '');
  if (digits.length !== 9) {
    return res.status(400).json({
      ok: false,
      error: 'Social Security Number must be exactly 9 digits.',
    });
  }
  const ssn_clean = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`;

  const full_name = `${first_name} ${last_name}`.trim();

  try {
    const upsert = await pool.query(
      `INSERT INTO participants (
         first_name, last_name, full_name, email, phone, address, city, state, zip,
         workintexas_id, ssn, pathway, sap_course, gender, veteran_status, ethnicity
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (workintexas_id)
       DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                     full_name = EXCLUDED.full_name, email = EXCLUDED.email,
                     phone = EXCLUDED.phone, address = EXCLUDED.address, city = EXCLUDED.city,
                     state = EXCLUDED.state, zip = EXCLUDED.zip, ssn = EXCLUDED.ssn,
                     pathway = EXCLUDED.pathway, sap_course = EXCLUDED.sap_course,
                     gender = EXCLUDED.gender, veteran_status = EXCLUDED.veteran_status,
                     ethnicity = EXCLUDED.ethnicity, updated_at = now()
       RETURNING id, portal_token`,
      [first_name, last_name, full_name, email, phone, address, city, state, zip,
       workintexas_id, ssn_clean, pathway, sap_course, gender, veteran_status, ethnicity]
    );
    const participant = upsert.rows[0];

    const coords = await geocodeOneAddress(address, city, state, zip);

    // Shared participant summary for staff notifications (no SSN — see mailer.js).
    const participantSummary = {
      full_name, email, phone, workintexas_id,
      address, city, state, zip,
      pathway, sap_course, gender, veteran_status, ethnicity,
    };

    if (!coords) {
      sendStaffRegistrationNotice({ participant: participantSummary, status: 'no_geocode' });
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

    const { rows: offices } = await pool.query(
      `SELECT id, name, address, county, phone, email, hours, latitude, longitude
       FROM offices WHERE active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    if (offices.length === 0) {
      sendStaffRegistrationNotice({ participant: participantSummary, status: 'no_offices' });
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

    await pool.query(
      `INSERT INTO assignments (participant_id, office_id, distance_miles)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id)
       DO UPDATE SET office_id = EXCLUDED.office_id, distance_miles = EXCLUDED.distance_miles, assigned_at = now()`,
      [participant.id, nearest.id, nearestDistance.toFixed(2)]
    );
    await seedChecklistForParticipant(pool, participant.id);

    const checklistLink = `${process.env.APP_BASE_URL}/checklist/${participant.portal_token}`;

    await sendParticipantAssignment({
      to: email,
      fullName: full_name,
      office: nearest,
      checklistLink,
    });
    await pool.query(
      `UPDATE assignments SET notified_at = now() WHERE participant_id = $1`,
      [participant.id]
    );

    sendStaffRegistrationNotice({
      participant: participantSummary,
      status: 'matched',
      office: nearest,
      distanceMiles: nearestDistance.toFixed(2),
    });

    res.json({
      ok: true,
      matched: true,
      office: {
        name: nearest.name,
        county: nearest.county,
        address: nearest.address,
        phone: nearest.phone,
        email: nearest.email,
      },
      checklistLink,
    });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'This email or WorkInTexas ID is already registered.' });
    }
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.' });
  }
}));

// ── Participant checklist API ────────────────────────────────────────
// GET /api/checklist/:token -> participant info + office + checklist status
app.get('/api/checklist/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;

  const participant = await pool.query(
    `SELECT id, full_name, email FROM participants WHERE portal_token = $1`,
    [token]
  );
  if (participant.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const p = participant.rows[0];

  const office = await pool.query(
    `SELECT o.name, o.county, o.address, o.phone, o.email, o.hours
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
}));

// POST /api/checklist/:token/:stepKey/complete -> participant marks a step done
app.post('/api/checklist/:token/:stepKey/complete', asyncHandler(async (req, res) => {
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
}));

// ── Staff API ─────────────────────────────────────────────────────────
// Hashing both sides first gives equal-length buffers, which
// timingSafeEqual requires, and avoids leaking the password's length.
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function requireStaffAuth(req, res, next) {
  const expected = process.env.STAFF_DASHBOARD_PASSWORD;
  // Fail closed: if the password isn't configured, lock the staff API
  // instead of letting a missing header (undefined === undefined) through.
  if (!expected) {
    console.error('STAFF_DASHBOARD_PASSWORD is not set — staff API is disabled.');
    return res.status(503).json({ error: 'Staff access is not configured' });
  }
  const provided = req.headers['x-staff-password'];
  if (!provided || !crypto.timingSafeEqual(sha256(provided), sha256(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/staff/participants -> every participant, office, and progress
app.get('/api/staff/participants', requireStaffAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.full_name, p.email, p.phone, p.workintexas_id, p.pathway,
      p.created_at,
      o.name AS office_name, o.county AS office_county,
      a.distance_miles, a.notified_at,
      COUNT(c.*) FILTER (WHERE c.status = 'complete') AS steps_complete,
      COUNT(c.*) AS steps_total
    FROM participants p
    LEFT JOIN assignments a ON a.participant_id = p.id
    LEFT JOIN offices o ON o.id = a.office_id
    LEFT JOIN checklist_items c ON c.participant_id = p.id
    GROUP BY p.id, o.name, o.county, a.distance_miles, a.notified_at
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
}));

// GET /api/staff/participants/:id -> full detail + checklist for one participant
app.get('/api/staff/participants/:id', requireStaffAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const participant = await pool.query(
    `SELECT p.*, o.name AS office_name, o.county AS office_county, o.address AS office_address,
            o.phone AS office_phone, o.email AS office_email, a.distance_miles
     FROM participants p
     LEFT JOIN assignments a ON a.participant_id = p.id
     LEFT JOIN offices o ON o.id = a.office_id
     WHERE p.id = $1`,
    [id]
  );
  if (participant.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const p = participant.rows[0];

  // Mask SSN before it leaves the server. The full value stays in the DB
  // for eligibility use, but the dashboard only ever sees last-4.
  if (p.ssn) {
    const digits = String(p.ssn).replace(/\D/g, '');
    p.ssn = digits.length === 9 ? `•••-••-${digits.slice(-4)}` : '•••-••-••••';
  }

  const checklist = await pool.query(
    `SELECT t.step_key, t.step_label, t.step_order, c.status, c.completed_at, c.completed_by
     FROM checklist_items c
     JOIN checklist_template t ON t.step_key = c.step_key
     WHERE c.participant_id = $1
     ORDER BY t.step_order`,
    [id]
  );

  res.json({ participant: p, checklist: checklist.rows });
}));

// POST /api/staff/participants/:id/:stepKey/complete -> staff marks a step done
app.post('/api/staff/participants/:id/:stepKey/complete', requireStaffAuth, asyncHandler(async (req, res) => {
  const { id, stepKey } = req.params;
  await pool.query(
    `UPDATE checklist_items
     SET status = 'complete', completed_at = now(), completed_by = 'staff'
     WHERE participant_id = $1 AND step_key = $2`,
    [id, stepKey]
  );
  res.json({ ok: true });
}));

// POST /api/staff/participants/:id/:stepKey/reset -> staff un-checks a step
app.post('/api/staff/participants/:id/:stepKey/reset', requireStaffAuth, asyncHandler(async (req, res) => {
  const { id, stepKey } = req.params;
  await pool.query(
    `UPDATE checklist_items
     SET status = 'pending', completed_at = NULL, completed_by = NULL
     WHERE participant_id = $1 AND step_key = $2`,
    [id, stepKey]
  );
  res.json({ ok: true });
}));

// ── HTML pages ────────────────────────────────────────────────────────
app.get('/wioa', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'wioa.html'));
});
app.get('/checklist/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'checklist.html'));
});
app.get('/staff', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'staff.html'));
});

// Static files (index.html, wioa.html assets, etc.) — must come after the
// explicit routes above so /checklist/:token and /staff aren't shadowed.
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Error handler ─────────────────────────────────────────────────────
// Catches anything forwarded by asyncHandler (DB down, bad query, etc.) so
// one failed request returns JSON instead of hanging or crashing the server.
// Must be registered last and keep all four arguments — that's how Express
// recognises error middleware.
app.use((err, req, res, next) => {
  // 22P02 = invalid_text_representation, e.g. a non-UUID in /participants/:id
  if (err.code === '22P02') {
    return res.status(404).json({ error: 'Not found' });
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
