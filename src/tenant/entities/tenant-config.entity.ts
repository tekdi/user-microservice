import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('TenantConfigs')
@Index(['tenantId', 'context'], { unique: true })
export class TenantConfig {
  @PrimaryGeneratedColumn('uuid')
  tenantConfigId: string;

  @Column({ type: 'text', nullable: false })
  tenantId: string;

  @Column({ type: 'text', nullable: false })
  context: string;

  @Column({ type: 'jsonb', nullable: false })
  config: Record<string, any>;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
} 