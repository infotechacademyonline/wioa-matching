// ── Central email module ─────────────────────────────────────────────
// One SMTP transport, all email content in one place. Everything else
// (server.js, sendNotification.js, future cron scripts) imports from here
// so we never end up with two competing nodemailer configs.
//
// Public API:
//   sendParticipantAssignment({ to, fullName, office, checklistLink })
//     → sends the "here's your assigned office" email to the participant.
//   sendStaffRegistrationNotice({ participant, status, office?, distanceMiles? })
//     → notifies staff of every new registration. Status is one of:
//         'matched' | 'no_geocode' | 'no_offices'
//
// Notes on SSN:
//   Staff notification emails must NEVER include SSN. The staff dashboard
//   is where SSN is viewed (last 4 only). Do not add SSN to any template
//   in this file, even by accident.

require('dotenv').config();
const nodemailer = require('nodemailer');
const { buildAssignmentEmailHtml, buildAssignmentEmailText } = require('./emailTemplate');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// The participant-facing "your office assignment" email.
// Returns the nodemailer info object so callers can log messageId or
// update `notified_at` on success.
async function sendParticipantAssignment({ to, fullName, office, checklistLink }) {
  const payload = { fullName, office, checklistLink };
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Your WIOA program office assignment',
    text: buildAssignmentEmailText(payload),
    html: buildAssignmentEmailHtml(payload),
  });
}

// Internal-facing staff notification. Sent to STAFF_NOTIFY_TO if set,
// otherwise learn@infotechacademy.online.
//
// Fire-and-forget: the caller does NOT await this in the request path,
// so a slow SMTP round-trip can't block the participant's response and
// a Gmail outage can't break registration. Failures log to stderr.
function sendStaffRegistrationNotice({ participant, status, office, distanceMiles, participantEmailFailed = false }) {
  const to = process.env.STAFF_NOTIFY_TO || 'learn@infotechacademy.online';

  const statusLine =
    status === 'matched'    ? `Matched to ${office.name} (${distanceMiles} mi away)` :
    status === 'no_geocode' ? 'Address could not be verified — needs manual assignment' :
    status === 'no_offices' ? 'No active offices in the system — needs manual assignment' :
                              'Unknown status';

  const subject = status === 'matched' && !participantEmailFailed
    ? `New WIOA registration — ${participant.full_name}`
    : `New WIOA registration NEEDS FOLLOW-UP — ${participant.full_name}`;

  const lines = [
    `Status: ${statusLine}`,
    ...(participantEmailFailed
      ? [`>>> The office-assignment email to the participant FAILED to send. Run \`npm run notify\` to retry, or contact them directly.`]
      : []),
    ``,
    `Name:              ${participant.full_name}`,
    `Email:             ${participant.email}`,
    `Phone:             ${participant.phone}`,
    `WorkInTexas ID:    ${participant.workintexas_id}`,
    `Address:           ${participant.address}, ${participant.city}, ${participant.state} ${participant.zip}`,
    `Pathway:           ${participant.pathway}${participant.sap_course ? ' — ' + participant.sap_course : ''}`,
    `Gender:            ${participant.gender || '—'}`,
    `Veteran status:    ${participant.veteran_status || '—'}`,
    `Ethnicity:         ${participant.ethnicity || '—'}`,
  ];
  // SSN intentionally omitted — see file header.

  if (status === 'matched') {
    lines.push(``, `Assigned office:   ${office.name}`);
    if (office.county)  lines.push(`County:            ${office.county}`);
    if (office.address) lines.push(`Office address:    ${office.address}`);
    if (office.phone)   lines.push(`Office phone:      ${office.phone}`);
    if (office.email)   lines.push(`Office email:      ${office.email}`);
    lines.push(`Distance:          ${distanceMiles} miles`);
  } else {
    lines.push(``, `>>> Please follow up with this participant to assign an office manually.`);
  }

  // Fire and forget — caller does not await.
  transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: lines.join('\n'),
  }).catch((err) => {
    console.error('Staff notification email failed:', err.message);
  });
}

module.exports = {
  transporter,   // exported for scripts that need the raw transport (unusual)
  sendParticipantAssignment,
  sendStaffRegistrationNotice,
};
