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
  assetId?: string;

  @Column("varchar", { nullable: false })
  context: string;

  @Column("varchar", { nullable: true })
  groupId?: string;

  @Column("varchar", { nullable: false })
  name: string;

  @Column("varchar", { nullable: false })
  label: string;

  @Column("varchar", { nullable: true })
  defaultValue?: string;

  @Column({
    type: "enum",
    enum: FieldType,
    default: FieldType.TEXT,
    nullable: false,
  })
  type: FieldType;

  @Column("varchar", { nullable: true })
  note?: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column("text", { nullable: false })
  state: string;

  @Column("bool", { nullable: false })
  required: boolean;

  @Column("int4", { nullable: false })
  ordering: number;

  @Column("varchar", { nullable: true })
  metadata?: string;

  @Column("varchar", { nullable: true })
  access?: string;

  @Column("bool", { nullable: false })
  onlyUseInSubform: boolean;

  @Column("uuid", { nullable: false })
  tenantId: string;

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
  createdBy?: string;

  @Column("varchar", { nullable: true })
  updatedBy?: string;

  @Column("uuid", { nullable: true })
  contextId?: string;

  @Column("varchar", { nullable: true })
  render?: string;

  @Column("varchar", { nullable: true })
  contextType?: string;

  @Column("jsonb", { nullable: true })
  fieldParams?: object;

  @Column("json", { nullable: true })
  fieldAttributes?: any;

  @OneToMany(() => FieldValues, (fieldValues) => fieldValues.field)
  @JoinColumn({ name: "fieldValuesId" })
  fieldValues: FieldValues[];

  @Column({ type: "jsonb", nullable: true })
  sourceDetails: any;

  @Column({ type: "varchar" })
  dependsOn: string;
}
