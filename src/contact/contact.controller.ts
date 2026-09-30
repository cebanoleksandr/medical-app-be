import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ContactService } from './contact.service';
import { ContactMessageDto } from './dto/contact-message.dto';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /** Landing page "Send us a message". Emails the team; stores nothing. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async send(@Body() dto: ContactMessageDto) {
    await this.contact.submit(dto);
    return { message: "Thanks! We'll get back to you within 24 hours." };
  }
}
