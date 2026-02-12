import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('pathways')
@Index(['key'], { unique: true })
@Index(['is_active'])
@Index(['display_order'])
export class Pathway {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
  key: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column('text', { array: true, nullable: true, default: [] })
  tags: string[] | null;

  @Column({ type: 'int', nullable: false })
  display_order: number;

  @Column({ type: 'boolean', default: true, nullable: false })
  is_active: boolean;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;
}

