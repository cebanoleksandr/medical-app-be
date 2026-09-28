import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityController } from './activity.controller';
import { AuditEvent } from './audit-event.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  controllers: [ActivityController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
