import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Fields } from './fields.entity';

@Entity('FieldValues', { schema: 'public' })
export class FieldValues {

  @PrimaryGeneratedColumn('uuid', { name: 'fieldValuesId' })
  fieldValuesId: string = uuidv4();

  @Column('varchar', { length: 255, nullable: false })
  value: string;

  @Column('uuid', { nullable: false })
  itemId: string;

  @Column('uuid', { nullable: false })
  fieldId: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()', nullable: false })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()', nullable: false })
  updatedAt: Date;

  @Column('uuid', { nullable: true })
  createdBy?: string;

  @Column('uuid', { nullable: true })
  updatedBy?: string;

  @ManyToOne(() => Fields, (field) => field.fieldValues)
  @JoinColumn({ name: 'fieldId' })
  field: Fields;

}