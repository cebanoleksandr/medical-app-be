import { renderMagicLinkEmail } from './magic-link';

const branding = {
  logoUrl: 'https://api.example.com/api/email-assets/logo.png',
  appUrl: 'https://app.example.com',
};
const link = 'https://app.example.com/auth/verify?token=abc_DEF-123';

describe('renderMagicLinkEmail', () => {
  it('renders the sign-in email in the shared layout', () => {
    const { subject, html, text } = renderMagicLinkEmail({
      locale: 'en',
      link,
      ttlMinutes: 15,
      branding,
    });
    expect(subject).toBe('Your sign-in link to De-ID Studio');
    expect(html).toContain(`src="${branding.logoUrl}"`);
    expect(html).toContain('Sign in to De-ID Studio');
    expect(html).toContain(`href="${link}"`);
    expect(html).toContain('expires in 15 minutes');
    expect(text).toContain(link);
  });

  it('speaks Ukrainian', () => {
    const { subject, html } = renderMagicLinkEmail({
      locale: 'uk',
      link,
      ttlMinutes: 15,
      branding,
    });
    expect(subject).toBe('Посилання для входу в De-ID Studio');
    expect(html).toContain('Увійти');
    expect(html).toContain('Політика конфіденційності');
  });
});
