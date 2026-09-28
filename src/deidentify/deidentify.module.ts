import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { Analysis } from './entities/analysis.entity';
import { PresidioClient } from './presidio.client';
import { TextExtractionService } from './text-extraction.service';

@Module({
  imports: [TypeOrmModule.forFeature([Analysis])],
  controllers: [AnalysesController],
  providers: [AnalysesService, PresidioClient, TextExtractionService],
  exports: [AnalysesService, PresidioClient],
})
export class DeidentifyModule {}
