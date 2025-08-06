import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('TenantConfigAudits')
export class TenantConfigAudit {
  @PrimaryGeneratedColumn('uuid')
  tenantConfigAuditId: string;

  @Column({ type: 'text', nullable: false })
  tenantId: string;

  @Column({ type: 'text', nullable: false })
  context: string;

  @Column({ type: 'text', nullable: true })
  changedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  oldConfig: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  newConfig: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  changedAt: Date;
} 