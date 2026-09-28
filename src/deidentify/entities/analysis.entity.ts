import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { DeidMethod, Framework } from '../catalog/frameworks';
import { IdentifierKey } from '../catalog/identifiers';
import { OutputMode } from '../operators';

export enum Sensitivity {
  CONSERVATIVE = 'CONSERVATIVE',
  BALANCED = 'BALANCED',
  AGGRESSIVE = 'AGGRESSIVE',
}

/**
 * Metadata of a de-identification run. Neither the input text nor any detected
 * value is stored: only settings and aggregate counts.
 */
@Entity('analyses')
@Index(['userId', 'createdAt'])
export class Analysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  framework: Framework;

  @Column({ type: 'varchar', length: 32 })
  method: DeidMethod;

  /** Identifier keys applied (catalogue keys, never detected values). */
  @Column({ type: 'text', array: true })
  identifiers: IdentifierKey[];

  @Column({ name: 'output_mode', type: 'varchar', length: 16 })
  outputMode: OutputMode;

  @Column({ type: 'varchar', length: 8 })
  language: string;

  @Column({ type: 'varchar', length: 16 })
  sensitivity: Sensitivity;

  @Column({ name: 'input_length', type: 'int' })
  inputLength: number;

  @Column({ name: 'detected_count', type: 'int' })
  detectedCount: number;

  @Column({ name: 'processed_count', type: 'int' })
  processedCount: number;

  @Column({ name: 'avg_confidence', type: 'real', nullable: true })
  avgConfidence: number | null;

  @Column({ name: 'processing_ms', type: 'int' })
  processingMs: number;

  /** Count per entity type, e.g. { "PERSON": 2, "DATE_TIME": 3 }. */
  @Column({ name: 'entity_counts', type: 'jsonb' })
  entityCounts: Record<string, number>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
