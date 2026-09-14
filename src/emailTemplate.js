// Builds the HTML (and plain-text fallback) for the welcome / office-assignment email.
//
// Email clients (especially Outlook) don't support modern CSS — no flexbox,
// no grid, limited custom fonts, inconsistent gradient support. So unlike
// the website, this uses old-school table layout and inline styles only.
// That's not a style downgrade, it's just how reliable HTML email works.

const { WHATSAPP_GROUP_URL } = require('./links');

function buildAssignmentEmailHtml({ fullName, office, checklistLink, pathway }) {
  const ink = '#0a0f1f';
  const gold = '#eda93a';
  const muted = '#626b7a';
  const text = '#12151c';
  const line = '#e5e1d6';
  const green = '#1a7a3d';

  const pathwayPhrase = pathway ? ` in <strong style="color:${text};">${escapeHtml(pathway)}</strong>` : '';

  // One numbered "next step" row. `extra` is optional HTML (e.g. a button).
  const step = (n, title, body, extra = '') => `
      <tr>
        <td width="36" valign="top" style="padding:0 0 22px;">
          <div style="width:26px; height:26px; line-height:26px; border-radius:13px; background-color:${ink}; color:#ffffff; font-size:13px; font-weight:bold; text-align:center;">${n}</div>
        </td>
        <td valign="top" style="padding:2px 0 22px;">
          <p style="margin:0 0 4px; color:${text}; font-size:15px; font-weight:bold;">${title}</p>
          <p style="margin:0; color:${muted}; font-size:14px; line-height:1.6;">${body}</p>
          ${extra}
        </td>
      </tr>`;

  const button = (href, label, bg, color) => `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            <tr>
              <td style="background-color:${bg}; border-radius:8px;">
                <a href="${href}" style="display:inline-block; padding:11px 22px; color:${color}; font-size:14px; font-weight:bold; text-decoration:none;">${label}</a>
              </td>
            </tr>
          </table>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Infotech Academy</title>
</head>
<body style="margin:0; padding:0; background-color:#f2efe8; font-family:Arial, Helvetica, sans-serif;">
<!-- Inbox preview text (hidden) -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Welcome to Infotech Academy! Here's your assigned office and your next steps.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2efe8; padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; max-width:600px; width:100%;">

  <!-- Header -->
  <tr>
    <td style="background-color:${ink}; padding:28px 36px;">
      <span style="color:#ffffff; font-size:18px; font-weight:bold;">Infotech Academy</span>
    </td>
  </tr>

  <!-- Welcome -->
  <tr>
    <td style="padding:36px 36px 8px;">
      <p style="margin:0; color:${gold}; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">Registration confirmed</p>
      <h1 style="margin:10px 0 0; color:${text}; font-size:24px;">Welcome aboard, ${escapeHtml(fullName)}!</h1>
    </td>
  </tr>

  <tr>
    <td style="padding:12px 36px 0;">
      <p style="margin:0 0 14px; color:${muted}; font-size:15px; line-height:1.6;">
        Thank you for registering for WIOA-funded training with Infotech Academy${pathwayPhrase}.
        We're excited to have you with us, and our team is here to support you every step of the way
        as you build your career in tech.
      </p>
      <p style="margin:0; color:${muted}; font-size:15px; line-height:1.6;">
        We've matched you with your nearest Workforce Solutions office:
      </p>
    </td>
  </tr>

  <!-- Office card -->
  <tr>
    <td style="padding:18px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${line}; border-radius:10px;">
        <tr>
          <td style="padding:20px 22px;">
            <p style="margin:0 0 4px; color:${text}; font-size:16px; font-weight:bold;">${escapeHtml(office.name || '')}</p>
            ${office.county ? `<p style="margin:0 0 10px; color:${gold}; font-size:13px; font-weight:bold;">${escapeHtml(office.county)}</p>` : ''}
            <p style="margin:0 0 6px; color:${muted}; font-size:14px; line-height:1.6;">${escapeHtml(office.address || '')}</p>
            ${office.phone ? `<p style="margin:0 0 4px; color:${muted}; font-size:14px;">Phone: ${escapeHtml(office.phone)}</p>` : ''}
            ${office.email ? `<p style="margin:0; color:${muted}; font-size:14px;">Email: ${escapeHtml(office.email)}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Next steps -->
  <tr>
    <td style="padding:30px 36px 0;">
      <p style="margin:0 0 18px; color:${text}; font-size:17px; font-weight:bold;">Your next steps</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${step(1, 'Visit your assigned office',
          'Bring your WorkInTexas ID. Staff there will confirm your eligibility and the opportunities available to you.')}
        ${step(2, 'Join our WhatsApp community',
          'Stay connected with the Infotech Academy team for program updates, announcements, and support.',
          button(WHATSAPP_GROUP_URL, 'Join the WhatsApp group &rarr;', green, '#ffffff'))}
        ${step(3, 'Track your enrollment checklist',
          'Check off each step as you complete it — our team will see your progress update automatically. This link is unique to you, so no login is required.',
          button(checklistLink, 'View my checklist &rarr;', gold, '#1b1200'))}
      </table>
    </td>
  </tr>

  <!-- Sign-off -->
  <tr>
    <td style="padding:8px 36px 36px;">
      <p style="margin:0 0 14px; color:${muted}; font-size:14px; line-height:1.6;">
        Questions? Reach us anytime at
        <a href="mailto:learn@infotechacademy.online" style="color:${text};">learn@infotechacademy.online</a>
        or <span style="white-space:nowrap;">+1 (832) 886-0377</span>. We look forward to welcoming you to class!
      </p>
      <p style="margin:0; color:${text}; font-size:14px; line-height:1.6;">
        Warm regards,<br>
        <strong>The Infotech Academy Team</strong>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background-color:#faf9f6; border-top:1px solid ${line}; padding:24px 36px;">
      <p style="margin:0; color:${muted}; font-size:12px; text-align:center;">
        Infotech Academy &middot; 10814 S. Kirkwood Rd, Houston, TX 77099<br>
        <a href="mailto:learn@infotechacademy.online" style="color:${muted};">learn@infotechacademy.online</a> &middot; +1 (832) 886-0377
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
`;
}

function buildAssignmentEmailText({ fullName, office, checklistLink, pathway }) {
  const officeLines = [
    office.name,
    office.county,
    office.address,
    office.phone && `Phone: ${office.phone}`,
    office.email && `Email: ${office.email}`,
  ].filter(Boolean).map((l) => `  ${l}`).join('\n');

  return `Welcome aboard, ${fullName}!

Thank you for registering for WIOA-funded training with Infotech Academy${pathway ? ` in ${pathway}` : ''}. We're excited to have you with us, and our team is here to support you every step of the way as you build your career in tech.

We've matched you with your nearest Workforce Solutions office:

${officeLines}

YOUR NEXT STEPS

1. Visit your assigned office
   Bring your WorkInTexas ID. Staff there will confirm your eligibility and the opportunities available to you.

2. Join our WhatsApp community
   Stay connected with the Infotech Academy team for program updates, announcements, and support.
   ${WHATSAPP_GROUP_URL}

3. Track your enrollment checklist
   Check off each step as you complete it. This link is unique to you, so no login is required.
   ${checklistLink}

Questions? Reach us anytime at learn@infotechacademy.online or +1 (832) 886-0377. We look forward to welcoming you to class!

Warm regards,
The Infotech Academy Team

Infotech Academy · 10814 S. Kirkwood Rd, Houston, TX 77099
`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { buildAssignmentEmailHtml, buildAssignmentEmailText };
