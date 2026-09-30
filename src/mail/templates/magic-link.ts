import {
  button,
  card,
  EmailBranding,
  greeting,
  heading,
  Locale,
  note,
  paragraph,
  renderLayout,
  textFooter,
} from './layout';

export { SUPPORTED_LOCALES } from './layout';
export type { Locale } from './layout';

const copy: Record<
  Locale,
  {
    subject: string;
    title: string;
    greeting: string;
    intro: string;
    expires: string;
    button: string;
    copyLink: string;
    ignore: string;
  }
> = {
  en: {
    subject: 'Your sign-in link to De-ID Studio',
    title: 'Sign in to De-ID Studio',
    greeting: 'Hello,',
    intro: 'Use the button below to sign in to your account.',
    expires: 'The link expires in {minutes} minutes and can be used once.',
    button: 'Sign in',
    copyLink: 'Or paste this link into your browser:',
    ignore: "If you didn't request this email, you can safely ignore it.",
  },
  uk: {
    subject: 'Посилання для входу в De-ID Studio',
    title: 'Вхід у De-ID Studio',
    greeting: 'Вітаємо!',
    intro: 'Натисніть кнопку нижче, щоб увійти у свій обліковий запис.',
    expires:
      'Посилання дійсне {minutes} хвилин і може бути використане один раз.',
    button: 'Увійти',
    copyLink: 'Або вставте це посилання у браузер:',
    ignore: 'Якщо ви не запитували цей лист, просто проігноруйте його.',
  },
};

export function renderMagicLinkEmail(options: {
  locale: Locale;
  link: string;
  ttlMinutes: number;
  branding: EmailBranding;
}) {
  const { locale, link, ttlMinutes, branding } = options;
  const t = copy[locale];
  const expires = t.expires.replace('{minutes}', String(ttlMinutes));

  const html = renderLayout({
    locale,
    branding,
    preheader: expires,
    body: [
      heading(t.title),
      greeting(t.greeting),
      paragraph(t.intro, expires),
      button(link, t.button),
      card(t.copyLink, [link], { breakAll: true }),
      note(t.ignore),
    ].join('\n'),
  });

  const text = [
    t.title,
    '',
    t.greeting,
    t.intro,
    expires,
    '',
    link,
    '',
    t.ignore,
    '',
    textFooter(locale),
  ].join('\n');

  return { subject: t.subject, html, text };
}
