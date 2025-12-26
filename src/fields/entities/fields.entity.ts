import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  JoinColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { FieldValues } from "./fields-values.entity";

export enum FieldType {
  TEXT = "text", // string
  NUMERIC = "numeric", // string
  RADIO = "radio", // string
  DROPDOWN = "drop_down", // comma seperated string array
  CHECKBOX = "checkbox", // comma seperated string array
  JSON = "json", // json object
}

@Entity({ name: "Fields" })
export class Fields {
  @PrimaryGeneratedColumn("uuid", { name: "fieldId" })
  fieldId: string;

  @Column("varchar", { nullable: true })
  context: string | null;

  @Column("varchar", { nullable: false })
  name: string;

  @Column("varchar", { nullable: false })
  label: string;

  @Column({
    type: "enum",
    enum: FieldType,
    default: FieldType.TEXT,
    nullable: false,
  })
  type: FieldType;

  @Column("bool", { nullable: false })
  required: boolean;

  @Column("uuid", { nullable: true })
  tenantId: string | null;

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

  @Column("varchar", { nullable: true })
  createdBy: string | null;

  @Column("varchar", { nullable: true })
  updatedBy: string | null;

  @Column("varchar", { nullable: true })
  contextType: string | null;

  @Column("jsonb", { nullable: true })
  fieldParams?: object;

  @Column("json", { nullable: true })
  fieldAttributes?: any;

  @OneToMany(() => FieldValues, (fieldValues) => fieldValues.field)
  @JoinColumn({ name: "fieldValuesId" })
  fieldValues: FieldValues[];

  @Column({ type: "jsonb", nullable: true })
  sourceDetails: any;

  @Column({ type: "varchar", nullable: true })
  dependsOn: string | null;
}
