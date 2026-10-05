import { Module } from '@nestjs/common';
import { DeidentifyModule } from '../deidentify/deidentify.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DeidentifyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
