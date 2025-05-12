import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('Tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  tenantId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  domain: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  params: any;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string;

  @Column({ type: 'json', nullable: true })
  programImages: any;

  @Column({ type: 'int', default: () => `nextval('"Tenants_ordering_seq"'::regclass)` })
  ordering: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  programHead: string;

  @Column({ type: 'text', default: 'draft' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  templateId: string;

  @Column({ type: 'text', nullable: true })
  contentFramework: string;

  @Column({ type: 'text', nullable: true })
  collectionFramework: string;

  @Column({ type: 'text', nullable: true })
  channelId: string;

  @Column({ type: 'json', nullable: true })
  contentFilter: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  type: string;

  @Column({ type: 'varchar', nullable: true })
  context_type: string;
}
