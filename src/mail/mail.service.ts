import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * `console` logs the message (local dev).
 * `brevo` sends via Brevo's HTTP API: free tier is 300 emails/day, needs only a
 * verified sender address (no domain), and uses HTTPS, which free hosts like
 * Render and Railway don't block the way they block outbound SMTP.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<void> {
    if (this.config.get('MAIL_PROVIDER') === 'brevo') {
      return this.sendViaBrevo(message);
    }
    this.logger.log(
      `[console mail] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
  }

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
      }),
    });

    if (!res.ok) {
      // Only Brevo's error code: its message can echo the recipient address.
      const { code } = await res.json().catch(() => ({ code: undefined }));
      throw new Error(`Brevo responded ${res.status} (${code ?? 'no code'})`);
    }
  }
}
