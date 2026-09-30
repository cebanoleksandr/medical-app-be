import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import {
  renderContactConfirmation,
  renderContactEmail,
} from '../mail/templates/contact-message';
import { ContactMessageDto } from './dto/contact-message.dto';

/**
 * Forwards landing page messages to the team inbox and confirms receipt to
 * the visitor. Nothing is stored and nothing the visitor typed is logged.
 */
const CONFIRMATION_COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly confirmedAt = new Map<string, number>();

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: ContactMessageDto): Promise<void> {
    if (dto.website) {
      // Honeypot filled: a bot. Pretend success so it doesn't adapt.
      this.logger.warn('Contact form honeypot triggered');
      return;
    }

    const to = this.config.get<string>('CONTACT_TO_EMAIL');
    if (!to) {
      this.logger.error('CONTACT_TO_EMAIL is not set');
      throw new ServiceUnavailableException('The contact form is unavailable');
    }

    const branding = this.mail.branding();
    try {
      await this.mail.send({
        to,
        replyTo: dto.email,
        ...renderContactEmail(dto, branding),
      });
    } catch (err) {
      this.logger.error(`Contact message not sent: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Your message could not be sent. Please try again later.',
      );
    }

    await this.sendConfirmation(dto);
  }

  /**
   * "We received your message!" to the visitor. Best effort: the team already
   * has the message. At most one per address per hour, so the form can't be
   * used to flood someone else's inbox.
   */
  private async sendConfirmation(dto: ContactMessageDto): Promise<void> {
    const now = Date.now();
    for (const [email, at] of this.confirmedAt) {
      if (now - at > CONFIRMATION_COOLDOWN_MS) this.confirmedAt.delete(email);
    }
    if (this.confirmedAt.has(dto.email)) return;
    this.confirmedAt.set(dto.email, now);

    try {
      await this.mail.send({
        to: dto.email,
        ...renderContactConfirmation(
          dto,
          dto.locale ?? 'en',
          this.mail.branding(),
        ),
      });
    } catch (err) {
      // Expected until Resend has a verified domain: without one it only
      // delivers to the account owner's address.
      this.logger.warn(
        `Contact confirmation not sent: ${(err as Error).message}`,
      );
    }
  }
}
