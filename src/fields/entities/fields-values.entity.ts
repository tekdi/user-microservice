import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Fields } from "./fields.entity";

/**
 * Entity for storing field values with type-specific columns
 */
@Entity("FieldValues", { schema: "public" })
export class FieldValues {
  @PrimaryGeneratedColumn("uuid", { name: "fieldValuesId" })
  fieldValuesId: string = uuidv4();

  @Column("varchar", { length: 255, nullable: false })
  value: string;

  @Column("uuid", { nullable: false })
  itemId: string;

  @Column("uuid", { nullable: false })
  fieldId: string;

  // Type-specific value columns
  @Column({ name: 'textValue', type: 'text', nullable: true })
  textValue: string;

  @Column({ name: 'numberValue', type: 'numeric', nullable: true })
  numberValue: number;

  @Column({ name: 'calendarValue', type: 'timestamp with time zone', nullable: true })
  calendarValue: Date;

  @Column({ name: 'dropdownValue', type: 'jsonb', nullable: true })
  dropdownValue: any;

  @Column({ name: 'radioValue', type: 'varchar', nullable: true })
  radioValue: string;

  @Column({ name: 'checkboxValue', type: 'boolean', nullable: true })
  checkboxValue: boolean;

  @Column({ name: 'textareaValue', type: 'text', nullable: true })
  textareaValue: string;

  @Column({ name: 'fileValue', type: 'varchar', nullable: true })
  fileValue: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  updatedAt: Date;

  @Column("uuid", { nullable: true })
  createdBy?: string;

  @Column("uuid", { nullable: true })
  updatedBy?: string;

  @ManyToOne(() => Fields, (field) => field.fieldValues)
  @JoinColumn({ name: "fieldId" })
  field: Fields;
}
