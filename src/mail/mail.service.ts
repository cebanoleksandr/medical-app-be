import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailBranding } from './templates/layout';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies go, e.g. the visitor who filled in the contact form. */
  replyTo?: string;
}

/**
 * `console` logs the message (local dev only).
 * `resend` / `brevo` send through the provider's HTTPS API: free hosts such as
 * Render and Railway block outbound SMTP, but not HTTPS.
 *
 * Provider errors are reduced to status + error code: their messages can echo
 * the recipient address, which must not reach the logs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Absolute URLs for email templates. The logo is served by this API, so it
   * needs the API's public origin: PUBLIC_API_URL, else the URL Render sets.
   * Page links start from APP_LINK_BASE, else APP_URL.
   */
  branding(): EmailBranding {
    const apiOrigin =
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('RENDER_EXTERNAL_URL') ||
      `http://localhost:${this.config.get('PORT')}`;
    return {
      logoUrl: new URL('/api/email-assets/logo.png', apiOrigin).toString(),
      appUrl:
        this.config.get<string>('APP_LINK_BASE') ||
        this.config.get<string>('APP_URL'),
    };
  }

  async send(message: MailMessage): Promise<void> {
    switch (this.config.get('MAIL_PROVIDER')) {
      case 'resend':
        return this.sendViaResend(message);
      case 'brevo':
        return this.sendViaBrevo(message);
      default:
        this.logger.log(
          `[console mail] to=${message.to} subject="${message.subject}"\n${message.text}`,
        );
    }
  }

  /** Free tier: 3 000 emails/month, 100/day; needs a verified domain. */
  private async sendViaResend(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.getOrThrow('RESEND_API_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.config.get('MAIL_FROM_NAME')} <${this.config.getOrThrow('MAIL_FROM_EMAIL')}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const { name } = await res.json().catch(() => ({ name: undefined }));
      throw new Error(`Resend responded ${res.status} (${name ?? 'no code'})`);
    }
  }

  /** Free tier: 300 emails/day; needs a verified sender and phone. */
  private async sendViaBrevo(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.config.getOrThrow('BREVO_API_KEY'),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: this.config.getOrThrow('MAIL_FROM_EMAIL'),
          name: this.config.get('MAIL_FROM_NAME'),
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
      }),
    });

    if (!res.ok) {
      const { code } = await res.json().catch(() => ({ code: undefined }));
      throw new Error(`Brevo responded ${res.status} (${code ?? 'no code'})`);
    }
  }
}
