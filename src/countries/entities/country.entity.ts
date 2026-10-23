import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('countries')
@Index(['name'], { unique: true })
@Index(['is_active'])
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150, nullable: false })
  name: string;

  @Column({ type: 'boolean', default: true, nullable: false })
  is_active: boolean;

  // ISO 3166-1 alpha-2, e.g. IN - used for mobile number validation
  @Column({ type: 'varchar', length: 2, nullable: true, unique: true })
  iso_code: string;

  // e.g. +91; null for territories with no phone numbering plan
  @Column({ type: 'varchar', length: 6, nullable: true })
  dial_code: string;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  created_at: Date;
}
