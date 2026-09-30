import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { join } from 'path';
import { Public } from '../auth/decorators/public.decorator';

/** Images referenced by outgoing emails; mail clients fetch them directly. */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('email-assets')
export class EmailAssetsController {
  @Get('logo.png')
  logo(@Res() res: Response) {
    // helmet's default same-origin CORP would block the image in webmail.
    res.setHeader('cross-origin-resource-policy', 'cross-origin');
    res.setHeader('cache-control', 'public, max-age=604800, immutable');
    res.sendFile(join(__dirname, 'assets', 'logo.png'));
  }
}
