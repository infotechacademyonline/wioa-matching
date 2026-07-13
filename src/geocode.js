// Geocodes any participant/office rows missing latitude/longitude.
// Uses the US Census Bureau's free geocoder (no API key required, US addresses only).
// For offices specifically, this also looks up the county name, since the
// registration form and email now display it alongside the office details.
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

// Same idea, but also asks the Census geocoder for the county the address
// falls in (its "geographies" layer), which the plain locations endpoint
// above doesn't include.
async function geocodeAddressWithCounty(address, city, state, zip) {
  const oneLine = [address, city, state, zip].filter(Boolean).join(', ');
  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress');
  url.searchParams.set('address', oneLine);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('layers', 'Counties');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];

  if (!match) {
    console.warn(`No geocode match for: ${oneLine}`);
    return null;
  }

  const county = match.geographies?.Counties?.[0]?.NAME || null;

  return {
    latitude: match.coordinates.y,
    longitude: match.coordinates.x,
    county,
  };
}

async function geocodeOffices() {
  const { rows } = await pool.query(
    `SELECT id, address, city, state, zip FROM offices WHERE latitude IS NULL OR county IS NULL`
  );

  console.log(`Geocoding ${rows.length} offices (with county lookup)...`);

  for (const row of rows) {
    const result = await geocodeAddressWithCounty(row.address, row.city, row.state, row.zip);
    if (result) {
      await pool.query(
        `UPDATE offices SET latitude = $1, longitude = $2, county = $3 WHERE id = $4`,
        [result.latitude, result.longitude, result.county, row.id]
      );
      console.log(`  ✓ ${row.address} -> ${result.latitude}, ${result.longitude} (${result.county || 'county unknown'})`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function geocodeParticipants() {
  const { rows } = await pool.query(
    `SELECT id, address, city, state, zip FROM participants WHERE latitude IS NULL`
  );

  console.log(`Geocoding ${rows.length} participants...`);

  for (const row of rows) {
    const coords = await geocodeAddress(row.address, row.city, row.state, row.zip);
    if (coords) {
      await pool.query(
        `UPDATE participants SET latitude = $1, longitude = $2 WHERE id = $3`,
        [coords.latitude, coords.longitude, row.id]
      );
      console.log(`  ✓ ${row.address} -> ${coords.latitude}, ${coords.longitude}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  await geocodeOffices();
  await geocodeParticipants();
  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

