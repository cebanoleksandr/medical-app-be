import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { Locale, renderMagicLinkEmail } from '../mail/templates/magic-link';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { MagicLinkToken } from './entities/magic-link-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RevokedUsers } from './revoked-users';
import { generateToken, hashToken, normalizeEmail } from './token.util';

const DAY_MS = 24 * 60 * 60 * 1000;
// Two tabs refreshing at the same moment is legitimate, not token theft.
const REUSE_GRACE_MS = 30 * 1000;

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: Pick<User, 'id' | 'email'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(MagicLinkToken)
    private readonly magicLinks: Repository<MagicLinkToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly revokedUsers: RevokedUsers,
  ) {}

  async requestMagicLink(rawEmail: string, locale: Locale = 'en') {
    const email = normalizeEmail(rawEmail);
    const ttlMinutes = this.config.get<number>('MAGIC_LINK_TTL_MINUTES');
    const windowStart = new Date(Date.now() - ttlMinutes * 60 * 1000);

    await this.magicLinks.delete({
      expiresAt: LessThan(new Date(Date.now() - DAY_MS)),
    });

    const recent = await this.magicLinks.countBy({
      email,
      createdAt: MoreThan(windowStart),
    });
    if (recent >= this.config.get<number>('MAGIC_LINK_MAX_PER_WINDOW')) {
      // Respond exactly as on success so the limit can't be used as a signal.
      this.logger.warn('Magic link per-email limit reached');
      return;
    }

    await this.magicLinks.update(
      { email, usedAt: IsNull(), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    const token = generateToken();
    await this.magicLinks.insert({
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    });

    const link = new URL('/auth/verify', this.config.get('APP_URL'));
    link.searchParams.set('token', token);

    await this.mail.send({
      to: email,
      ...renderMagicLinkEmail(locale, link.toString(), ttlMinutes),
    });
  }

  async verifyMagicLink(token: string): Promise<Session> {
    // Single atomic UPDATE so the same link can't be redeemed twice concurrently.
    const result = await this.magicLinks
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('token_hash = :hash', { hash: hashToken(token) })
      .andWhere('used_at IS NULL')
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > now()')
      .returning(['email'])
      .execute();

    const email: string | undefined = result.raw[0]?.email;
    if (!email) throw new UnauthorizedException('Invalid or expired link');

    const user = await this.users.upsertOnLogin(email);
    await this.audit.record(user.id, AuditAction.LOGIN);
    return this.issueSession(user);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<Session> {
    if (!rawRefreshToken) throw new UnauthorizedException();

    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: hashToken(rawRefreshToken) },
      relations: { user: true },
    });
    if (!stored || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException();
    }

    if (stored.revokedAt) {
      if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        // A long-rotated token came back: assume it leaked and end every session.
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}`,
        );
        await this.revokeAllForUser(stored.userId);
        await this.audit.record(stored.userId, AuditAction.REFRESH_TOKEN_REUSE);
      }
      throw new UnauthorizedException();
    }

    const { affected } = await this.refreshTokens.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!affected) throw new UnauthorizedException();

    return this.issueSession(stored.user);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const result = await this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where('token_hash = :hash', { hash: hashToken(rawRefreshToken) })
      .andWhere('revoked_at IS NULL')
      .returning(['user_id'])
      .execute();
    const userId: string | undefined = result.raw[0]?.user_id;
    if (userId) await this.audit.record(userId, AuditAction.LOGOUT);
  }

  /**
   * Right to erasure: removes the account and, by cascade, every analysis,
   * dataset, source, session and audit event that belongs to it.
   */
  async deleteAccount(userId: string, confirmEmail: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException();
    if (user.email !== normalizeEmail(confirmEmail)) {
      throw new BadRequestException('Confirm with the account email address');
    }
    await this.magicLinks.delete({ email: user.email });
    await this.users.delete(user.id);
    this.revokedUsers.add(user.id);
    this.logger.log(`Account ${user.id} deleted`);
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueSession(user: User): Promise<Session> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    const refreshToken = generateToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get<number>('REFRESH_TOKEN_TTL_DAYS') * DAY_MS,
    );
    await this.refreshTokens.insert({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: { id: user.id, email: user.email },
    };
  }
}
