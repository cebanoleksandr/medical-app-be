import { appLink } from './app-link';

describe('appLink', () => {
  it('joins an origin and a path', () => {
    expect(appLink('https://app.example.com', '/auth/verify')).toBe(
      'https://app.example.com/auth/verify',
    );
    expect(appLink('https://app.example.com/', 'privacy')).toBe(
      'https://app.example.com/privacy',
    );
  });

  it('keeps a sub-path and a hash route', () => {
    expect(
      appLink('https://user.github.io/medical-app-fe/#', '/auth/verify'),
    ).toBe('https://user.github.io/medical-app-fe/#/auth/verify');
    expect(
      appLink('https://user.github.io/medical-app-fe/#/', '/auth/verify'),
    ).toBe('https://user.github.io/medical-app-fe/#/auth/verify');
  });
});
