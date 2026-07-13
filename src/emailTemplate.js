// Builds the HTML (and plain-text fallback) for the office-assignment email.
//
// Email clients (especially Outlook) don't support modern CSS — no flexbox,
// no grid, limited custom fonts, inconsistent gradient support. So unlike
// the website, this uses old-school table layout and inline styles only.
// That's not a style downgrade, it's just how reliable HTML email works.

function buildAssignmentEmailHtml({ fullName, office, checklistLink }) {
  const ink = '#0a0f1f';
  const gold = '#eda93a';
  const muted = '#626b7a';
  const text = '#12151c';
  const line = '#e5e1d6';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your WIOA Office Assignment</title>
</head>
<body style="margin:0; padding:0; background-color:#f2efe8; font-family:Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2efe8; padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; max-width:600px; width:100%;">

  <!-- Header -->
  <tr>
    <td style="background-color:${ink}; padding:28px 36px;">
      <span style="color:#ffffff; font-size:18px; font-weight:bold;">Infotech Academy</span>
    </td>
  </tr>

  <!-- Eyebrow + heading -->
  <tr>
    <td style="padding:36px 36px 8px;">
      <p style="margin:0; color:${gold}; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">Registration confirmed</p>
      <h1 style="margin:10px 0 0; color:${text}; font-size:24px;">Hi ${escapeHtml(fullName)}, you're matched.</h1>
    </td>
  </tr>

  <tr>
    <td style="padding:12px 36px 0;">
      <p style="margin:0; color:${muted}; font-size:15px; line-height:1.6;">
        Thanks for registering. Here's your assigned Workforce Solutions office for your workshop:
      </p>
    </td>
  </tr>

  <!-- Office card -->
  <tr>
    <td style="padding:22px 36px 0;">
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

  <!-- CTA button -->
  <tr>
    <td style="padding:28px 36px 8px;" align="center">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background-color:${gold}; border-radius:8px;">
            <a href="${checklistLink}" style="display:inline-block; padding:14px 32px; color:#1b1200; font-size:15px; font-weight:bold; text-decoration:none;">
              View my checklist &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:8px 36px 36px;">
      <p style="margin:0; color:${muted}; font-size:13px; line-height:1.6; text-align:center;">
        This link is unique to you — no login required. Check items off as you complete them,
        and our team will see it update automatically.
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

function buildAssignmentEmailText({ fullName, office, checklistLink }) {
  return `Hi ${fullName},

Thanks for registering. Your assigned WIOA office for your workshop is:

${office.name || ''}
${office.county ? office.county + '\n' : ''}${office.address || ''}
${office.phone ? 'Phone: ' + office.phone : ''}
${office.email ? 'Email: ' + office.email : ''}

Track your enrollment steps here: ${checklistLink}

This link is unique to you — no login required.
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
