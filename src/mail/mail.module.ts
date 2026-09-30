import { Module } from '@nestjs/common';
import { EmailAssetsController } from './email-assets.controller';
import { MailService } from './mail.service';

@Module({
  controllers: [EmailAssetsController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
