import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { AuthService, Session } from './auth.service';
import { AuthUser, CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { VerifyMagicLinkDto } from './dto/verify-magic-link.dto';

const REFRESH_COOKIE = 'refresh_token';
const FIFTEEN_MINUTES = 15 * 60 * 1000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  @Post('magic-link')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestMagicLink(@Body() dto: RequestMagicLinkDto) {
    await this.auth.requestMagicLink(dto.email, dto.locale);
    return {
      message: 'If the address is valid, a sign-in link has been sent.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MINUTES } })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: VerifyMagicLinkDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.verifyMagicLink(dto.token));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      return this.startSession(res, session);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  async me(@CurrentUser() authUser: AuthUser) {
    const user = await this.users.findById(authUser.id);
    if (!user) throw new NotFoundException();
    return { id: user.id, email: user.email };
  }

  /** Deletes the account and all of its data. Cannot be undone. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.deleteAccount(user.id, dto.email);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private startSession(res: Response, session: Session) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE'),
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('COOKIE_SAMESITE'),
      path: '/api/auth',
    };
  }
}
