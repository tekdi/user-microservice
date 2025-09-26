import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('MagicLinks')
export class MagicLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16, unique: true })
  token: string;

  @Column({ type: 'varchar', length: 255 })
  identifier: string;

  @Column({ type: 'uuid'})
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  identifier_type: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  redirect_url: string;

  @Column({ type: 'varchar', length: 20 })
  notification_channel: string;

  @Column({ type: 'jsonb', nullable: true })
  optional_parameters: { [key: string]: string };

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'boolean', default: false })
  is_used: boolean;

  @Column({ type: 'boolean', default: false })
  is_expired: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
} 