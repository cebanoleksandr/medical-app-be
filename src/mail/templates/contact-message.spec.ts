import { escapeHtml, renderContactEmail } from './contact-message';

describe('renderContactEmail', () => {
  const details = {
    firstName: 'Olena',
    lastName: 'Petrenko',
    company: 'Kyiv Clinic',
    email: 'olena@example.com',
    message: 'Hello!\nWe need a demo.',
  };

  it('includes every field in both HTML and text', () => {
    const { subject, html, text } = renderContactEmail(details);
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

  it('escapes everything the visitor typed', () => {
    const { html } = renderContactEmail({
      ...details,
      firstName: '<img src=x onerror=alert(1)>',
      company: '"><a href="https://evil.test">click</a>',
      message: '<script>alert(1)</script> & more',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
  });

  it('keeps the subject on one line', () => {
    const { subject } = renderContactEmail({
      ...details,
      lastName: 'Petrenko\r\nBcc: victim@example.com',
    });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('handles missing optional fields', () => {
    const { subject, text } = renderContactEmail({
      firstName: 'Ivan',
      lastName: 'Koval',
      email: 'ivan@example.com',
    });
    expect(subject).toBe('New contact request: Ivan Koval');
    expect(text).toContain('(no message)');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
