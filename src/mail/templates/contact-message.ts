export interface ContactDetails {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  message?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Everything a visitor typed is untrusted: escape it before it goes in HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Subjects are single-line; drop control characters and cap the length. */
function subjectPart(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .trim()
    .slice(0, 80);
}

/** Notification to the team; replies go to the visitor via Reply-To. */
export function renderContactEmail(details: ContactDetails) {
  const name = `${details.firstName} ${details.lastName}`;
  const company = details.company || '—';
  const message = details.message || '(no message)';

  const subject = `New contact request: ${subjectPart(name)}${
    details.company ? ` (${subjectPart(details.company)})` : ''
  }`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6b82;vertical-align:top">${label}</td>` +
    `<td style="padding:4px 0">${escapeHtml(value)}</td></tr>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#f5f7fa;font-family:Arial,sans-serif;color:#0b1b33">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
      <tr><td>
        <h1 style="font-size:18px;margin:0 0 16px">New message from the website</h1>
        <table role="presentation">
          ${row('Name', name)}
          ${row('Company', company)}
          ${row('Email', details.email)}
        </table>
        <p style="margin:24px 0 8px;color:#5b6b82">Message</p>
        <p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p>
        <p style="margin:24px 0 0;font-size:13px;color:#5b6b82">Reply to this email to answer ${escapeHtml(details.firstName)} directly.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    'New message from the website',
    '',
    `Name: ${name}`,
    `Company: ${company}`,
    `Email: ${details.email}`,
    '',
    message,
  ].join('\n');

  return { subject, html, text };
}
