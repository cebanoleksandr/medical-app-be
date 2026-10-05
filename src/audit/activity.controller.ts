import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';
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
  constructor(private readonly audit: AuditService) {}

  /** The signed-in user's own audit trail, newest first. */
  @Get('activity')
  activity(@CurrentUser() user: AuthUser, @Query() query: ListActivityDto) {
    return this.audit.list(user.id, query.limit, query.before);
  }
}
