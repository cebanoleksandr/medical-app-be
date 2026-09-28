import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditAction, AuditEvent } from './audit-event.entity';

const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.purgeOld();
    this.purgeTimer = setInterval(() => void this.purgeOld(), PURGE_EVERY_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.purgeTimer);
  }

  /** Never fails the caller: a lost audit row must not break a user action. */
  async record(
    userId: string,
    action: AuditAction,
    resourceId: string | null = null,
    metadata: AuditEvent['metadata'] = {},
  ): Promise<void> {
    try {
      await this.events.insert({ userId, action, resourceId, metadata });
    } catch (err) {
      this.logger.error(
        `Audit write failed (${action}): ${(err as Error).message}`,
      );
    }
  }

  async list(userId: string, limit: number, before?: Date) {
    const events = await this.events.find({
      where: { userId, ...(before ? { createdAt: LessThan(before) } : {}) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return events.map(({ id, action, resourceId, metadata, createdAt }) => ({
      id,
      action,
      resourceId,
      metadata,
      createdAt,
    }));
  }

  private async purgeOld() {
    const days = this.config.get<number>('AUDIT_RETENTION_DAYS');
    try {
      await this.events.delete({
        createdAt: LessThan(new Date(Date.now() - days * 86_400_000)),
      });
    } catch (err) {
      this.logger.error(`Audit purge failed: ${(err as Error).message}`);
    }
  }
}
