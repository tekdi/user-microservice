import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TagStatus {
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('tags')
@Index(['name'], { unique: true })
@Index(['status'])
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  name: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
    default: TagStatus.PUBLISHED,
  })
  status: TagStatus;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  created_at: Date;
}

