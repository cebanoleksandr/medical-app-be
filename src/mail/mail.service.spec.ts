import { ConfigService } from '@nestjs/config';
import { MailMessage, MailService } from './mail.service';

const message: MailMessage = {
  to: 'patient@example.com',
  subject: 'Sign in',
  html: '<p>link</p>',
  text: 'link',
};

function serviceWith(env: Record<string, string>) {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      if (!(key in env)) throw new Error(`missing ${key}`);
      return env[key];
    },
  } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('sends through Resend', async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    await serviceWith({
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      MAIL_FROM_EMAIL: 'noreply@deid.studio',
      MAIL_FROM_NAME: 'De-ID Studio',
    }).send(message);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({
      from: 'De-ID Studio <noreply@deid.studio>',
      to: ['patient@example.com'],
      subject: 'Sign in',
      html: '<p>link</p>',
      text: 'link',
    });
  });

  it('keeps the recipient out of provider errors', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 403,
          name: 'validation_error',
          message: 'You can only send testing emails to patient@example.com',
        }),
        { status: 403 },
      ),
    );
    const sending = serviceWith({
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      MAIL_FROM_EMAIL: 'onboarding@resend.dev',
    }).send(message);

    await expect(sending).rejects.toThrow(
      'Resend responded 403 (validation_error)',
    );
    await expect(sending).rejects.not.toThrow(/patient@example\.com/);
  });

  it('does not call any provider in console mode', async () => {
    await serviceWith({ MAIL_PROVIDER: 'console' }).send(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
