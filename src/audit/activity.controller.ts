import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { AuditService } from './audit.service';

export class ListActivityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /** Cursor: `createdAt` of the last event from the previous page. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  before?: Date;
}

@ApiTags('Activity')
@Controller()
export class ActivityController {
  constructor(
    private readonly audit: AuditService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** The signed-in user's own audit trail, newest first. */
  @Get('activity')
  activity(@CurrentUser() user: AuthUser, @Query() query: ListActivityDto) {
    return this.audit.list(user.id, query.limit, query.before);
  }

  /** Totals for the Dashboard. */
  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthUser) {
    const [[analyses], [datasets]] = await Promise.all([
      this.db.query(
        `SELECT count(*)::int AS count,
                coalesce(sum(detected_count), 0)::int AS "entitiesDetected"
           FROM analyses WHERE user_id = $1`,
        [user.id],
      ),
      this.db.query(
        `SELECT count(*)::int AS count,
                coalesce(sum(record_count), 0)::int AS "recordsGenerated",
                count(*) FILTER (WHERE expires_at > now())::int AS active
           FROM synthetic_datasets WHERE user_id = $1`,
        [user.id],
      ),
    ]);
    return {
      analyses,
      datasets,
      recentActivity: await this.audit.list(user.id, 10),
    };
  }
}
