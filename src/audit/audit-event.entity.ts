import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum AuditAction {
  LOGIN = 'auth.login',
  LOGOUT = 'auth.logout',
  REFRESH_TOKEN_REUSE = 'auth.refresh_token_reuse',
  ANALYSIS_CREATED = 'analysis.created',
  TEXT_EXTRACTED = 'document.text_extracted',
  SOURCE_CREATED = 'synthetic.source_created',
  DATASET_CREATED = 'synthetic.dataset_created',
  DATASET_DOWNLOADED = 'synthetic.dataset_downloaded',
}

/**
 * Who did what, when. Metadata holds enums and counts only: never text, file
 * names, emails or IP addresses.
 */
@Entity('audit_events')
@Index(['userId', 'createdAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 48 })
  action: AuditAction;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, string | number | boolean | null>;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
