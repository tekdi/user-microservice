import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

export enum FormSubmissionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

@Entity('formSubmissions', { schema: 'public' })
@Check(`"status" IN ('active', 'inactive', 'archived')`)
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid', { name: 'submissionId' })
  submissionId: string;

  @Column('uuid', { nullable: false })
  formId: string;

  @Column('uuid', { nullable: false })
  itemId: string;

  @Column({
    type: 'text',
    default: 'inactive',
    nullable: false,
  })
  status: FormSubmissionStatus;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'now()',
    nullable: false,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'now()',
    nullable: false,
  })
  updatedAt: Date;

  @Column('uuid', { nullable: true })
  createdBy?: string;

  @Column('uuid', { nullable: true })
  updatedBy?: string;
}
