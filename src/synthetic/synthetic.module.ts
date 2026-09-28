import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeidentifyModule } from '../deidentify/deidentify.module';
import { SyntheticDataset } from './entities/synthetic-dataset.entity';
import { SourcesController } from './sources/sources.controller';
import { SourcesService } from './sources/sources.service';
import { SyntheticSource } from './sources/synthetic-source.entity';
import { SyntheticController } from './synthetic.controller';
import { SyntheticService } from './synthetic.service';
import { ValidationService } from './validation/validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyntheticDataset, SyntheticSource]),
    DeidentifyModule,
  ],
  controllers: [SyntheticController, SourcesController],
  providers: [SyntheticService, SourcesService, ValidationService],
})
export class SyntheticModule {}
