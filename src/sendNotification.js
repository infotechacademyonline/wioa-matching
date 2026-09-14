// Sends the "here's your office + checklist link" email to every participant
// who has an assignment but hasn't been notified yet. Run this after
// `npm run match`, or wire it to run automatically at the end of match.js.
//
// After the mailer refactor: this file no longer owns SMTP config or email
// templates — it just picks up rows and calls the shared mailer.

require('dotenv').config();
const { Pool } = require('pg');
const { sendParticipantAssignment } = require('./mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.full_name, p.email, p.portal_token,
      o.name AS office_name, o.county AS office_county, o.address AS office_address,
      o.phone AS office_phone, o.email AS office_email,
      a.id AS assignment_id
    FROM assignments a
    JOIN participants p ON p.id = a.participant_id
    JOIN offices o ON o.id = a.office_id
    WHERE a.notified_at IS NULL
  `);

  console.log(`Sending ${rows.length} notification emails...`);

  for (const r of rows) {
    const checklistLink = `${process.env.APP_BASE_URL}/checklist/${r.portal_token}`;
    const office = {
      name: r.office_name,
      county: r.office_county,
      address: r.office_address,
      phone: r.office_phone,
      email: r.office_email,
    };

    try {
      await sendParticipantAssignment({
        to: r.email,
        fullName: r.full_name,
        office,
        checklistLink,
      });
      await pool.query(`UPDATE assignments SET notified_at = now() WHERE id = $1`, [r.assignment_id]);
      console.log(`  ✓ Sent to ${r.email}`);
    } catch (err) {
      console.error(`  ✗ Failed for ${r.email}: ${err.message}`);
      // Don't rethrow — keep going through the batch so one bad address
      // doesn't leave the rest unnotified.
    }
  }

  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
