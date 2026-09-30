import {
  escapeHtml,
  renderContactConfirmation,
  renderContactEmail,
} from './contact-message';

const branding = {
  logoUrl: 'https://api.example.com/api/email-assets/logo.png',
  appUrl: 'https://app.example.com',
};

const details = {
  firstName: 'Olena',
  lastName: 'Petrenko',
  company: 'Kyiv Clinic',
  email: 'olena@example.com',
  message: 'Hello!\nWe need a demo.',
};

const hostile = {
  ...details,
  firstName: '<img src=x onerror=alert(1)>',
  company: '"><a href="https://evil.test">click</a>',
  message: '<script>alert(1)</script> & more',
};

describe('renderContactEmail (to the team)', () => {
  it('includes every field in both HTML and text', () => {
    const { subject, html, text } = renderContactEmail(details, branding);
    expect(subject).toBe('New contact request: Olena Petrenko (Kyiv Clinic)');
    for (const value of [
      'Olena Petrenko',
      'Kyiv Clinic',
      'olena@example.com',
    ]) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
    expect(text).toContain('Hello!\nWe need a demo.');
  });

  it('uses the shared layout', () => {
    const { html } = renderContactEmail(details, branding);
    expect(html).toContain(`src="${branding.logoUrl}"`);
    expect(html).toContain('New message from the website');
    expect(html).toContain('https://app.example.com/privacy');
  });

  it('escapes everything the visitor typed', () => {
    const { html } = renderContactEmail(hostile, branding);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
  });

  it('keeps the subject on one line', () => {
    const { subject } = renderContactEmail(
      { ...details, lastName: 'Petrenko\r\nBcc: victim@example.com' },
      branding,
    );
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('handles missing optional fields', () => {
    const { subject, text } = renderContactEmail(
      { firstName: 'Ivan', lastName: 'Koval', email: 'ivan@example.com' },
      branding,
    );
    expect(subject).toBe('New contact request: Ivan Koval');
    expect(text).toContain('(no message)');
  });
});

describe('renderContactConfirmation (to the visitor)', () => {
  it('matches the design copy', () => {
    const { subject, html, text } = renderContactConfirmation(
      details,
      'en',
      branding,
    );
    expect(subject).toBe('We received your message');
    expect(html).toContain('We received your message!');
    expect(html).toContain('Hi Olena,');
    expect(html).toContain('Your message:');
    expect(html).toContain('Hello!\nWe need a demo.');
    expect(html).toContain('will get back to you within 24 hours.');
    expect(text).toContain('Hi Olena,');
  });

  it('speaks Ukrainian', () => {
    const { subject, html } = renderContactConfirmation(
      details,
      'uk',
      branding,
    );
    expect(subject).toBe('Ми отримали ваше повідомлення');
    expect(html).toContain('Вітаємо, Olena!');
    expect(html).toContain('lang="uk"');
  });

  it('escapes and shortens the quoted message', () => {
    const { html } = renderContactConfirmation(hostile, 'en', branding);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');

    const long = renderContactConfirmation(
      { ...details, message: 'x'.repeat(5000) },
      'en',
      branding,
    );
    expect(long.text).toContain(`${'x'.repeat(1000)}…`);
    expect(long.text).not.toContain('x'.repeat(1001));
  });

  it('omits the message card when there is no message', () => {
    const { html } = renderContactConfirmation(
      { ...details, message: undefined },
      'en',
      branding,
    );
    expect(html).not.toContain('Your message:');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
