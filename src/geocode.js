// Geocodes any participant/office rows missing latitude/longitude.
// Uses the US Census Bureau's free geocoder (no API key required, US addresses only).
// If your addresses are inconsistent or you need non-US coverage, swap the
// `geocodeAddress` function to call Google's Geocoding API instead — the
// GOOGLE_GEOCODE_API_KEY slot is already in .env.example for that switch.

require('dotenv').config();
const fetch = require('node-fetch');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function geocodeAddress(address, city, state, zip) {
  const oneLine = [address, city, state, zip].filter(Boolean).join(', ');
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', oneLine);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];

  if (!match) {
    console.warn(`No geocode match for: ${oneLine}`);
    return null;
  }

  return {
    latitude: match.coordinates.y,
    longitude: match.coordinates.x,
  };
}

async function geocodeTable(table) {
  const { rows } = await pool.query(
    `SELECT id, address, city, state, zip FROM ${table} WHERE latitude IS NULL`
  );

  console.log(`Geocoding ${rows.length} rows in ${table}...`);

  for (const row of rows) {
    const coords = await geocodeAddress(row.address, row.city, row.state, row.zip);
    if (coords) {
      await pool.query(
        `UPDATE ${table} SET latitude = $1, longitude = $2 WHERE id = $3`,
        [coords.latitude, coords.longitude, row.id]
      );
      console.log(`  ✓ ${row.address} -> ${coords.latitude}, ${coords.longitude}`);
    }
    // Be polite to the free public API
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  await geocodeTable('offices');
  await geocodeTable('participants');
  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
