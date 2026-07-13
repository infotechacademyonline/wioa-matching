// Sends the "here's your office + checklist link" email to every participant
// who has an assignment but hasn't been notified yet. Run this after
// `npm run match`, or wire it to run automatically at the end of match.js.

require('dotenv').config();
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const { buildAssignmentEmailHtml, buildAssignmentEmailText } = require('./emailTemplate');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

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
    const payload = { fullName: r.full_name, office, checklistLink };

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: r.email,
      subject: 'Your WIOA program office assignment',
      text: buildAssignmentEmailText(payload),
      html: buildAssignmentEmailHtml(payload),
    });

    await pool.query(`UPDATE assignments SET notified_at = now() WHERE id = $1`, [r.assignment_id]);
    console.log(`  ✓ Sent to ${r.email}`);
  }

  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
