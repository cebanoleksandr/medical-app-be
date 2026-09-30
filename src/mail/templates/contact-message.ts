import {
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

export { escapeHtml } from './layout';

export interface ContactDetails {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  message?: string;
}

/** The visitor's text is quoted back to them, but not at any length. */
const QUOTE_LIMIT = 1000;

/** Subjects are single-line; drop control characters and cap the length. */
function subjectPart(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .trim()
    .slice(0, 80);
}

function quote(message: string): string {
  return message.length > QUOTE_LIMIT
    ? `${message.slice(0, QUOTE_LIMIT).trimEnd()}…`
    : message;
}

/** To the team inbox; replies go to the visitor via Reply-To. */
export function renderContactEmail(
  details: ContactDetails,
  branding: EmailBranding,
) {
  const name = `${details.firstName} ${details.lastName}`;
  const company = details.company || '—';
  const message = details.message || '(no message)';

  const subject = `New contact request: ${subjectPart(name)}${
    details.company ? ` (${subjectPart(details.company)})` : ''
  }`;

  const html = renderLayout({
    locale: 'en',
    branding,
    preheader: `${name} sent a message via the website`,
    body: [
      heading('New message from the website'),
      paragraph(`${name} filled in the contact form.`),
      card('Contact details:', [
        `Name: ${name}`,
        `Company: ${company}`,
        `Email: ${details.email}`,
      ]),
      card('Message:', [message]),
      note(`Reply to this email to answer ${details.firstName} directly.`),
    ].join('\n'),
  });

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

const confirmationCopy: Record<
  Locale,
  {
    subject: string;
    title: string;
    greeting: string;
    lines: [string, string];
    yourMessage: string;
    meanwhile: string;
  }
> = {
  en: {
    subject: 'We received your message',
    title: 'We received your message!',
    greeting: 'Hi {name},',
    lines: [
      'Thanks for reaching out to De-ID Studio.',
      'We received your message and will get back to you within 24 hours.',
    ],
    yourMessage: 'Your message:',
    meanwhile:
      'In the meantime, feel free to explore our Help Center or check our FAQ.',
  },
  uk: {
    subject: 'Ми отримали ваше повідомлення',
    title: 'Ми отримали ваше повідомлення!',
    greeting: 'Вітаємо, {name}!',
    lines: [
      'Дякуємо, що звернулися до De-ID Studio.',
      'Ми отримали ваше повідомлення і відповімо протягом 24 годин.',
    ],
    yourMessage: 'Ваше повідомлення:',
    meanwhile:
      'А поки що можете переглянути наш Довідковий центр або розділ FAQ.',
  },
};

/** To the visitor: the "We received your message!" email from the design. */
export function renderContactConfirmation(
  details: ContactDetails,
  locale: Locale,
  branding: EmailBranding,
) {
  const t = confirmationCopy[locale];
  const hello = t.greeting.replace('{name}', details.firstName);
  const quoted = details.message ? quote(details.message) : null;

  const html = renderLayout({
    locale,
    branding,
    preheader: t.lines[1],
    body: [
      heading(t.title),
      greeting(hello),
      paragraph(...t.lines),
      quoted ? card(t.yourMessage, [quoted]) : '',
      note(t.meanwhile),
    ].join('\n'),
  });

  const text = [
    t.title,
    '',
    hello,
    ...t.lines,
    ...(quoted ? ['', t.yourMessage, quoted] : []),
    '',
    t.meanwhile,
    '',
    textFooter(locale),
  ].join('\n');

  return { subject: t.subject, html, text };
}
