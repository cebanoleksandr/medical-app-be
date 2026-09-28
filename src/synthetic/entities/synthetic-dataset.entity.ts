import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Framework } from '../../deidentify/catalog/frameworks';
import { User } from '../../users/user.entity';
import { AnyDatasetType } from '../datasets/types';
import { OutputFormat } from '../export/writers';
import { Language } from '../reference/localized';
import { SyntheticSource } from '../sources/synthetic-source.entity';

/**
 * A generated dataset is fully described by its parameters, seed and source
 * (if any): records are regenerated on demand, so no record is ever stored.
 */
@Entity('synthetic_datasets')
@Index(['userId', 'createdAt'])
export class SyntheticDataset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'dataset_type', type: 'varchar', length: 32 })
  datasetType: AnyDatasetType;

  /** Set for datasets generated from an uploaded file or a document. */
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @ManyToOne(() => SyntheticSource, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_id' })
  source: SyntheticSource | null;

  @Column({ type: 'varchar', length: 32 })
  framework: Framework;

  @Column({ type: 'varchar', length: 8 })
  language: Language;

  @Column({ name: 'record_count', type: 'int' })
  recordCount: number;

  @Column({ type: 'varchar', length: 8 })
  format: OutputFormat;

  @Column({ type: 'int' })
  seed: number;

  /** Anchor for generated dates, so records stay identical across requests. */
  @Column({ name: 'reference_date', type: 'timestamptz' })
  referenceDate: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
