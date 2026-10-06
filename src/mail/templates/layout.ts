/**
 * Shared email layout from the Figma "Email — Magic Link" frame (node
 * 1376:24500): navy header with the logo, white body, accent-bar card, footer.
 *
 * Email clients ignore <style> blocks and flexbox, so everything is tables
 * with inline styles. Every helper escapes the text it is given.
 */

import { appLink } from '../app-link';

export const SUPPORTED_LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Absolute URLs the email needs; images can't be embedded. */
export interface EmailBranding {
  logoUrl: string;
  /** Base for page links, joined with `appLink`. */
  appUrl: string;
}

// Design tokens from the Figma file.
const color = {
  pageBg: '#f4f4f5',
  border: '#e5e7eb', // neutral-200
  divider: '#f3f4f6', // neutral-100
  header: '#01132f', // primary-800
  white: '#ffffff',
  title: '#111827', // neutral-900
  text: '#374151', // neutral-700
  muted: '#6b7280', // neutral-500
  subtle: '#9ca3af', // neutral-400
  cardBg: '#e8eff7', // primary-50
  accent: '#00bfa5', // accent-400
};
const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const footerCopy: Record<
  Locale,
  { rights: string; privacy: string; terms: string }
> = {
  en: {
    rights: 'All rights reserved',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
  },
  uk: {
    rights: 'Усі права захищено',
    privacy: 'Політика конфіденційності',
    terms: 'Умови використання',
  },
};

// --- Body blocks: each returns one table row of the body. ---

export function heading(text: string): string {
  return `<tr><td align="center" style="padding:0 0 12px;font-family:${FONT};font-size:24px;line-height:28px;font-weight:600;color:${color.title}">${escapeHtml(text)}</td></tr>`;
}

export function greeting(text: string): string {
  return `<tr><td align="center" style="padding:0 0 8px;font-family:${FONT};font-size:14px;line-height:20px;color:${color.text}">${escapeHtml(text)}</td></tr>`;
}

/** Muted centred paragraph; each line on its own row, as in the design. */
export function paragraph(...lines: string[]): string {
  return `<tr><td align="center" style="padding:0 0 24px;font-family:${FONT};font-size:14px;line-height:20px;color:${color.muted}">${lines.map(escapeHtml).join('<br>')}</td></tr>`;
}

export function button(href: string, label: string): string {
  return `<tr><td align="center" style="padding:0 0 24px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${color.header}" style="border-radius:8px">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 32px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${color.white};text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
    </td>
  </tr></table>
</td></tr>`;
}

/**
 * Light-blue card with the teal bar on the left. `lines` are shown with
 * their line breaks kept; `breakAll` suits long URLs.
 */
export function card(
  label: string,
  lines: string[],
  options: { breakAll?: boolean } = {},
): string {
  const wrap = options.breakAll
    ? 'word-break:break-all;'
    : 'word-break:break-word;';
  return `<tr><td style="padding:0 0 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.cardBg}" style="border-radius:8px;border-collapse:separate">
    <tr>
      <td width="4" bgcolor="${color.accent}" style="width:4px;border-radius:8px 0 0 8px;font-size:0;line-height:0">&nbsp;</td>
      <td style="padding:16px 40px 16px 36px">
        <div style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:500;color:${color.subtle};padding-bottom:8px">${escapeHtml(label)}</div>
        <div style="font-family:${FONT};font-size:14px;line-height:20px;color:${color.text};white-space:pre-wrap;${wrap}">${lines.map(escapeHtml).join('\n')}</div>
      </td>
    </tr>
  </table>
</td></tr>`;
}

/** Small grey note above the footer, separated by a thin rule. */
export function note(text: string): string {
  return `<tr><td align="center" style="border-top:1px solid ${color.divider};padding:8px 0 0;font-family:${FONT};font-size:12px;line-height:16px;color:${color.subtle}">${escapeHtml(text)}</td></tr>`;
}

/**
 * The full document. `preheader` is the grey preview line inbox lists show
 * next to the subject; it is hidden in the email itself.
 */
export function renderLayout(options: {
  locale: Locale;
  branding: EmailBranding;
  preheader: string;
  body: string;
}): string {
  const { locale, branding, preheader, body } = options;
  const f = footerCopy[locale];
  const year = new Date().getFullYear();
  const link = (path: string, label: string) =>
    `<a href="${escapeHtml(appLink(branding.appUrl, path))}" target="_blank" style="color:${color.muted};text-decoration:none">${escapeHtml(label)}</a>`;

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>De-ID Studio</title>
</head>
<body style="margin:0;padding:0;background:${color.pageBg}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.pageBg}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid ${color.border};border-radius:16px;border-collapse:separate;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <tr><td align="center" bgcolor="${color.header}" style="padding:24px;border-radius:16px 16px 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:12px;vertical-align:middle"><img src="${escapeHtml(branding.logoUrl)}" width="32" height="34" alt="" style="display:block;border:0;width:32px;height:34px"></td>
            <td style="vertical-align:middle;font-family:${FONT};color:${color.white}">
              <div style="font-size:18px;line-height:26px;font-weight:600">De-ID Studio</div>
              <div style="font-size:12px;line-height:16px">De-ID &amp; Synthesis</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="${color.white}" style="padding:24px 48px 40px;border-radius:0 0 16px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${body}
            <tr><td align="center" style="padding:24px 0 0;font-family:${FONT};font-size:12px;line-height:16px;color:${color.subtle}">
              &copy; ${year} De-ID Studio. ${escapeHtml(f.rights)}
            </td></tr>
            <tr><td align="center" style="padding:8px 0 0;font-family:${FONT};font-size:12px;line-height:16px">
              ${link('/privacy', f.privacy)}&nbsp;&nbsp;&nbsp;&nbsp;${link('/terms', f.terms)}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text footer matching the HTML one. */
export function textFooter(locale: Locale): string {
  return `© ${new Date().getFullYear()} De-ID Studio. ${footerCopy[locale].rights}`;
}
