import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('contents')
export class Content {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 400, unique: true, nullable: true })
  alias: string;

  @Column({ type: 'text' })
  fulltext: string;

  @Column({ type: 'jsonb', nullable: true })
  params: any;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date| null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
