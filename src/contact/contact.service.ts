import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { renderContactEmail } from '../mail/templates/contact-message';
import { ContactMessageDto } from './dto/contact-message.dto';

/**
 * Forwards landing page messages to the team inbox. Nothing is stored and
 * nothing the visitor typed is logged.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

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

    try {
      await this.mail.send({
        to,
        replyTo: dto.email,
        ...renderContactEmail(dto),
      });
    } catch (err) {
      this.logger.error(`Contact message not sent: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Your message could not be sent. Please try again later.',
      );
    }
  }
}
