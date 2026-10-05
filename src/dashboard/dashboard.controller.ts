import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Totals, the daily chart and breakdowns for one period and framework. */
  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.dashboard.get(user.id, query);
  }
}
