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
import { Language } from '../reference/localized';

export enum SourceKind {
  FILE = 'FILE',
  DOCUMENT = 'DOCUMENT',
}

/**
 * What a sourced dataset is generated from: a file's column statistics or a
 * document template. Never raw rows or identifier values; still encrypted and
 * deleted once it expires.
 */
@Entity('synthetic_sources')
export class SyntheticSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 16 })
  kind: SourceKind;

  @Column({ type: 'varchar', length: 8 })
  language: Language;

  /** Shown to the user: column kinds, warnings, slot counts. No data values. */
  @Column({ type: 'jsonb' })
  summary: Record<string, unknown>;

  /** AES-256-GCM encrypted FileProfile or DocumentTemplate. */
  @Column({ type: 'bytea' })
  payload: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
