// Assigns each participant (that has coordinates) to the nearest active office
// (that has coordinates), writes the result to `assignments`, and seeds a
// fresh checklist for any participant who doesn't have one yet.

require('dotenv').config();
const { Pool } = require('pg');
const { seedChecklistForParticipant } = require('./checklistDefaults');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Straight-line ("as the crow flies") distance. Good enough for nearest-office
// selection. If offices are split by a river/highway in a way that makes
// straight-line distance misleading, swap this for a real drive-time API
// (Google Distance Matrix, OSRM, etc.) — the rest of the pipeline doesn't change.
function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

async function main() {
  const { rows: participants } = await pool.query(
    `SELECT id, full_name, latitude, longitude FROM participants
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
  );

  const { rows: offices } = await pool.query(
    `SELECT id, name, latitude, longitude FROM offices
     WHERE active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL`
  );

  if (offices.length === 0) {
    console.error('No geocoded active offices found. Run `npm run geocode` first.');
    process.exit(1);
  }

  console.log(`Matching ${participants.length} participants against ${offices.length} offices...`);

  for (const p of participants) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const o of offices) {
      const d = haversineMiles(p.latitude, p.longitude, o.latitude, o.longitude);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = o;
      }
    }

    if (!nearest) continue;

    await pool.query(
      `INSERT INTO assignments (participant_id, office_id, distance_miles)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id)
       DO UPDATE SET office_id = EXCLUDED.office_id,
                     distance_miles = EXCLUDED.distance_miles,
                     assigned_at = now()`,
      [p.id, nearest.id, nearestDistance.toFixed(2)]
    );

    await seedChecklistForParticipant(pool, p.id);

    console.log(`  ✓ ${p.full_name} -> ${nearest.name} (${nearestDistance.toFixed(1)} mi)`);
  }

  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
