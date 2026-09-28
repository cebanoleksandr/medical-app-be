export const SUPPORTED_LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const copy: Record<
  Locale,
  {
    subject: string;
    intro: string;
    button: string;
    expires: string;
    ignore: string;
  }
> = {
  en: {
    subject: 'Your sign-in link to De-ID Studio',
    intro: 'Click the button below to sign in to De-ID Studio.',
    button: 'Sign in',
    expires: 'The link expires in {minutes} minutes and can be used once.',
    ignore: "If you didn't request this email, you can safely ignore it.",
  },
  uk: {
    subject: 'Посилання для входу в De-ID Studio',
    intro: 'Натисніть кнопку нижче, щоб увійти в De-ID Studio.',
    button: 'Увійти',
    expires:
      'Посилання дійсне {minutes} хвилин і може бути використане один раз.',
    ignore: 'Якщо ви не запитували цей лист, просто проігноруйте його.',
  },
};

export function renderMagicLinkEmail(
  locale: Locale,
  link: string,
  ttlMinutes: number,
) {
  const t = copy[locale];
  const expires = t.expires.replace('{minutes}', String(ttlMinutes));

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:32px;background:#f5f7fa;font-family:Arial,sans-serif;color:#0b1b33">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 16px">De-ID Studio</h1>
        <p style="margin:0 0 24px">${t.intro}</p>
        <a href="${link}" style="display:inline-block;background:#1a2d5a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px">${t.button}</a>
        <p style="margin:24px 0 8px;font-size:13px;color:#5b6b82">${expires}</p>
        <p style="margin:0;font-size:13px;color:#5b6b82">${t.ignore}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `${t.intro}\n\n${link}\n\n${expires}\n${t.ignore}`;

  return { subject: t.subject, html, text };
}
