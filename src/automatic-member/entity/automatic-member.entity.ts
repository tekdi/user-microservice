import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'AutomaticMember' })
export class AutomaticMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false })
  userId: string;

  @Column('jsonb', { nullable: false })
  rules: any;

  @Column('uuid', { nullable: false })
  tenantId: string;

  @Column({ type: "bool", default: true, nullable: false })
  isActive: boolean;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    nullable: true,
  })
  createdAt: Date | null;
}
