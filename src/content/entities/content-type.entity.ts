import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('content_type')
export class ContentType {
  @PrimaryGeneratedColumn('uuid', { name: 'type_id' })
  typeId: string;

  @Column({ name: 'type_title', type: 'varchar', length: 400 })
  typeTitle: string;

  @Index({ unique: true })
  @Column({ name: 'type_alias', type: 'varchar', length: 400 })
  typeAlias: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
